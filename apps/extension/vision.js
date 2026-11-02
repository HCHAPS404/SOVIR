// SOVIR vision module — PURE function, no DOM, no chrome APIs, no I/O.
// Loaded via importScripts by background.js (MV3 worker) and imported
// by the test suite. Deterministic QR finder detection over bounded
// regions — the closed-taxonomy v0 of ADR-0020. Learned labels
// (image_lure, brand_impersonation) are NOT_IMPLEMENTED: no model
// artifact exists and this module refuses to guess.
//
// Input:  { data: RGBA bytes, width, height }, optional regions.
// Output: { signals: [...typed enums], frame } — the analyzed (possibly
//         downsampled) pixels so the caller can digest them. Pixels
//         never leave the worker; only the enum set and a sha256 of the
//         analyzed frame cross to the API.
//
// The detector looks for the QR finder signature: dark-light-dark-
// light-dark runs with module ratio 1:1:3:1:1 on BOTH axes, ≥2 distinct
// candidates each — then cross-confirms corners: a row-center ×
// column-center crossing must land on a dark core pixel. A real code
// confirms three; two is the bar — decoupled axis hits (UI chrome,
// striped layouts) fail it. Same rule as the Rust twin in
// crates/sovir-edge-extract/src/vision.rs — keep them in sync.

(function attach(global) {
  const MAX_SCAN_LINES = 512;
  const MIN_AXIS_HITS = 2;
  const MIN_CORNER_HITS = 2;
  const MIN_WINDOW_PX = 7;
  const MIN_LUMA_RANGE = 32;
  const MAX_REGIONS = 64;
  const MAX_DIM = 1024;

  function luma(d, i) {
    return ((299 * d[i] + 587 * d[i + 1] + 114 * d[i + 2]) / 1000) | 0;
  }

  // Nearest-neighbour downsample: the largest analyzed side is never
  // above MAX_DIM — capture size cannot turn the scan unbounded.
  function bound(image) {
    const { data, width, height } = image;
    const m = Math.max(width, height);
    if (m <= MAX_DIM) return { data, width, height, scale: 1 };
    const scale = MAX_DIM / m;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(width - 1, Math.floor(x / scale));
        const sy = Math.min(height - 1, Math.floor(y / scale));
        const si = (sy * width + sx) * 4;
        const di = (y * w + x) * 4;
        out[di] = data[si];
        out[di + 1] = data[si + 1];
        out[di + 2] = data[si + 2];
        out[di + 3] = data[si + 3];
      }
    }
    return { data: out, width: w, height: h, scale };
  }

  // Adaptive binarization threshold: midpoint of the sampled luma
  // range, or null when the region lacks usable contrast.
  function binThreshold(d, w, r) {
    const xs = Math.max(1, Math.floor(r.w / 64));
    const ys = Math.max(1, Math.floor(r.h / 64));
    let lo = 255;
    let hi = 0;
    for (let y = r.y; y < r.y + r.h; y += ys) {
      for (let x = r.x; x < r.x + r.w; x += xs) {
        const l = luma(d, (y * w + x) * 4);
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      }
    }
    if (hi - lo < MIN_LUMA_RANGE) return null;
    return (lo + hi) / 2;
  }

  // Run-length encode one scan line and slide 5-run windows looking for
  // the finder ratio. Returns distinct candidate centers on this axis.
  function scanAxis(d, w, r, thr, rows) {
    const outer = rows ? r.h : r.w;
    const inner = rows ? r.w : r.h;
    const stride = Math.max(1, Math.floor(outer / MAX_SCAN_LINES));
    const centers = [];
    for (let o = 0; o < outer; o += stride) {
      const line = rows ? r.y + o : r.x + o;
      const runs = [];
      let curDark = false;
      let curLen = 0;
      let curStart = 0;
      for (let i = 0; i < inner; i++) {
        const x = rows ? r.x + i : line;
        const y = rows ? line : r.y + i;
        const dark = luma(d, (y * w + x) * 4) < thr;
        if (i === 0 || dark === curDark) {
          curDark = dark;
          curLen++;
        } else {
          runs.push({ d: curDark, l: curLen, s: curStart });
          curDark = dark;
          curLen = 1;
          curStart = i;
        }
      }
      if (curLen > 0) runs.push({ d: curDark, l: curLen, s: curStart });
      collectWindows(runs, centers);
    }
    return centers;
  }

  // 5-run window must be dark-light-dark-light-dark with module ratio
  // 1:1:3:1:1 (±half a module, integer math — |run*7 - k*total|*2 <= total).
  function collectWindows(runs, centers) {
    for (let i = 0; i + 4 < runs.length; i++) {
      const w = runs.slice(i, i + 5);
      if (!(w[0].d && !w[1].d && w[2].d && !w[3].d && w[4].d)) continue;
      const total = w[0].l + w[1].l + w[2].l + w[3].l + w[4].l;
      if (total < MIN_WINDOW_PX) continue;
      const ok = (l, k) => Math.abs(l * 7 - k * total) * 2 <= total;
      if (!(ok(w[0].l, 1) && ok(w[1].l, 1) && ok(w[2].l, 3) && ok(w[3].l, 1) && ok(w[4].l, 1)))
        continue;
      const center = w[2].s + Math.floor(w[2].l / 2);
      const module = Math.max(2, Math.floor(total / 7));
      if (centers.some((c) => Math.abs(c - center) <= module)) continue;
      centers.push(center);
    }
  }

  // image: {data, width, height}; regions: optional [{x,y,w,h}].
  // Returns {signals: string[], frame: {data,width,height}} or null on
  // malformed input — fail-closed like the Rust twin.
  function scan(image, regions) {
    if (
      !image ||
      !image.data ||
      !image.width ||
      !image.height ||
      image.data.length < image.width * image.height * 4
    )
      return null;
    const f = bound(image);
    // Caller regions arrive in ORIGINAL capture coords — scale them;
    // the default whole-frame region is already in analyzed coords.
    const rs = regions && regions.length
      ? regions.slice(0, MAX_REGIONS).map((r) => ({
          x: Math.round(r.x * f.scale),
          y: Math.round(r.y * f.scale),
          w: Math.round(r.w * f.scale),
          h: Math.round(r.h * f.scale),
        }))
      : [{ x: 0, y: 0, w: f.width, h: f.height }];
    const signals = [];
    for (const r0 of rs) {
      const cx = Math.min(Math.max(0, r0.x), f.width);
      const cy = Math.min(Math.max(0, r0.y), f.height);
      const r = {
        x: cx,
        y: cy,
        w: Math.min(r0.w, f.width - cx),
        h: Math.min(r0.h, f.height - cy),
      };
      if (r.w < MIN_WINDOW_PX || r.h < MIN_WINDOW_PX) continue;
      const thr = binThreshold(f.data, f.width, r);
      if (thr === null) continue;
      const xs = scanAxis(f.data, f.width, r, thr, true);
      const ys = scanAxis(f.data, f.width, r, thr, false);
      if (xs.length < MIN_AXIS_HITS || ys.length < MIN_AXIS_HITS) continue;
      // Corner confirmation: a row-center × column-center crossing
      // must land on a dark core pixel — decoupled hits are rejected.
      let corners = 0;
      for (const cx2 of xs) {
        for (const cy2 of ys) {
          if (corners >= 3) break;
          if (luma(f.data, ((r.y + cy2) * f.width + (r.x + cx2)) * 4) < thr) corners++;
        }
      }
      if (corners >= MIN_CORNER_HITS) signals.push("QR_PRESENT");
    }
    return { signals, frame: { data: f.data, width: f.width, height: f.height } };
  }

  global.sovirVisionScan = scan;
})(globalThis);
