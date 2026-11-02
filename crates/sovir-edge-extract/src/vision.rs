//! Closed-taxonomy vision classifier v0 (ADR-0020): deterministic
//! structure detection over gated regions — QR finder patterns today.
//! Learned labels (`image_lure`, `brand_impersonation`) are
//! NOT_IMPLEMENTED: no model artifact, license or eval exists yet, and
//! this module refuses to guess. Same hard boundary as the pixel path:
//! no I/O, no pixels retained, typed signals + digest only — and the
//! output is hypothesis material, never a verdict.
//!
//! The detector looks for the QR finder signature: dark-light-dark-
//! light-dark runs with module ratio 1:1:3:1:1, on both axes. A real
//! code carries three finders, so a single match stays silent — the
//! precision bar the ADR requires of a weak visual signal.

use sha2::{Digest, Sha256};
use sovir_domain::RiskSignal;

use crate::{clamp_rect, ExtractedSignal, Extraction, PixelFrame, Rect, MAX_REGIONS};

/// Scan lines evaluated per axis inside a region — bounds the search
/// the same way the structural pass bounds pixel sampling.
pub const MAX_SCAN_LINES: u32 = 512;
/// Distinct finder candidates required per axis before any corner
/// check. One 1:1:3:1:1 run can appear in noise; a QR carries three.
const MIN_AXIS_HITS: usize = 2;
/// Confirmed finder corners required to emit `QrPresent`. A corner is
/// confirmed when a row-center × column-center crossing lands on a
/// dark core pixel — the dark 3×3 heart of the pattern. A real code
/// confirms three; two is the precision bar — decoupled axis hits
/// (UI chrome, striped layouts) fail it.
const MIN_CORNER_HITS: usize = 2;
/// Minimum total width of a 5-run window — a finder pattern is at
/// least ~7 modules, and anything thinner cannot carry the ratio.
const MIN_WINDOW_PX: u32 = 7;
/// Below this sampled luma range the region has no usable contrast —
/// binarization would be noise, so the region is skipped.
const MIN_LUMA_RANGE: u8 = 32;

/// Deterministic region scan. Same input contract as `extract`:
/// `None` on malformed input, whole-frame digest + typed signals out.
pub fn classify(frame: &PixelFrame<'_>, regions: &[Rect]) -> Option<Extraction> {
    let need = (frame.width as u64)
        .checked_mul(frame.height as u64)?
        .checked_mul(4)?;
    if need != frame.rgba.len() as u64 || frame.width == 0 || frame.height == 0 {
        return None;
    }
    let content_digest = format!("sha256:{:x}", Sha256::digest(frame.rgba));
    let mut signals = Vec::new();
    for region in regions.iter().take(MAX_REGIONS) {
        let r = clamp_rect(*region, frame.width, frame.height);
        if r.w < MIN_WINDOW_PX || r.h < MIN_WINDOW_PX {
            continue;
        }
        let corners = finder_hits(frame, r);
        if corners >= MIN_CORNER_HITS {
            signals.push(ExtractedSignal {
                signal: RiskSignal::QrPresent,
                confidence_bp: (5_000 + 1_000 * corners as u64).min(9_999) as u16,
                region: r,
            });
        }
    }
    Some(Extraction {
        content_digest,
        signals,
    })
}

/// Counts CONFIRMED finder corners. Each axis first yields candidate
/// centers (5-run dark-light-dark-light-dark windows matching the
/// 1:1:3:1:1 module ratio); a corner is confirmed when a row-center ×
/// column-center crossing lands on a dark pixel — the finder's dark
/// core. Decoupled hits that satisfy each axis separately but share
/// no dark crossing are rejected here.
fn finder_hits(frame: &PixelFrame<'_>, r: Rect) -> usize {
    let Some(threshold) = bin_threshold(frame, r) else {
        return 0;
    };
    let xs = scan_axis_centers(frame, r, threshold, true);
    let ys = scan_axis_centers(frame, r, threshold, false);
    if xs.len() < MIN_AXIS_HITS || ys.len() < MIN_AXIS_HITS {
        return 0;
    }
    xs.iter()
        .flat_map(|cx| ys.iter().map(move |cy| (*cx, *cy)))
        .filter(|&(cx, cy)| luma(frame, r.x + cx, r.y + cy) < threshold)
        .take(3)
        .count()
}

/// Adaptive binarization threshold: midpoint of the sampled luma
/// range, or `None` when the region lacks usable contrast.
fn bin_threshold(frame: &PixelFrame<'_>, r: Rect) -> Option<u8> {
    let xstep = (r.w / 64).max(1);
    let ystep = (r.h / 64).max(1);
    let (mut lo, mut hi) = (u8::MAX, u8::MIN);
    let mut y = r.y;
    while y < r.y + r.h {
        let mut x = r.x;
        while x < r.x + r.w {
            let lum = luma(frame, x, y);
            lo = lo.min(lum);
            hi = hi.max(lum);
            x += xstep;
        }
        y += ystep;
    }
    if hi.saturating_sub(lo) < MIN_LUMA_RANGE {
        return None;
    }
    Some(((lo as u16 + hi as u16) / 2) as u8)
}

/// Run-length encodes one horizontal (`rows=true`) or vertical scan
/// line and slides 5-run windows looking for the 1:1:3:1:1 finder
/// ratio. Returns the distinct candidate centers (axis coordinates,
/// region-relative) so the caller can cross-confirm corners.
fn scan_axis_centers(frame: &PixelFrame<'_>, r: Rect, threshold: u8, rows: bool) -> Vec<u32> {
    let (outer_len, inner_len) = if rows { (r.h, r.w) } else { (r.w, r.h) };
    let stride = (outer_len / MAX_SCAN_LINES).max(1);
    let mut centers: Vec<u32> = Vec::new();
    let mut outer = 0u32;
    while outer < outer_len {
        let line = if rows { r.y + outer } else { r.x + outer };
        let mut runs: Vec<(bool, u32, u32)> = Vec::new(); // (dark, len, start)
        let mut inner = 0u32;
        let (mut cur_dark, mut cur_len, mut cur_start) = (false, 0u32, 0u32);
        while inner < inner_len {
            let (x, y) = if rows {
                (r.x + inner, line)
            } else {
                (line, r.y + inner)
            };
            let dark = luma(frame, x, y) < threshold;
            if inner == 0 || dark == cur_dark {
                cur_dark = dark;
                cur_len += 1;
            } else {
                runs.push((cur_dark, cur_len, cur_start));
                cur_dark = dark;
                cur_len = 1;
                cur_start = inner;
            }
            inner += 1;
        }
        if cur_len > 0 {
            runs.push((cur_dark, cur_len, cur_start));
        }
        collect_finder_windows(&runs, &mut centers);
        outer += stride;
    }
    centers
}

/// Slides a 5-window over the run list; every match must be
/// dark-light-dark-light-dark with module ratio 1:1:3:1:1 (±half a
/// module, integer math). Distinct centers are appended — a repeat
/// within one module width of a known center is the same finder seen
/// by a neighbouring scan line.
fn collect_finder_windows(runs: &[(bool, u32, u32)], centers: &mut Vec<u32>) {
    for w in runs.windows(5) {
        if !(w[0].0 && !w[1].0 && w[2].0 && !w[3].0 && w[4].0) {
            continue;
        }
        let total: u32 = w.iter().map(|r| r.1).sum();
        if total < MIN_WINDOW_PX {
            continue;
        }
        // m = expected module width (total/7). |run - k*m| <= m/2
        // becomes 2*|run*7 - k*total| <= total.
        let m2 = total as u64; // 2*|x*7 - k*total| <= total
        let check = |run: u32, k: u64| 2 * (run as u64 * 7).abs_diff(k * total as u64) <= m2;
        let ratio_ok = check(w[0].1, 1)
            && check(w[1].1, 1)
            && check(w[2].1, 3)
            && check(w[3].1, 1)
            && check(w[4].1, 1);
        if !ratio_ok {
            continue;
        }
        let center = w[2].2 + w[2].1 / 2;
        let module = total / 7;
        if centers.iter().any(|c| c.abs_diff(center) <= module.max(2)) {
            continue;
        }
        centers.push(center);
    }
}

#[inline]
fn luma(frame: &PixelFrame<'_>, x: u32, y: u32) -> u8 {
    let i = ((y * frame.width + x) * 4) as usize;
    let (r, g, b) = (
        frame.rgba[i] as u32,
        frame.rgba[i + 1] as u32,
        frame.rgba[i + 2] as u32,
    );
    ((299 * r + 587 * g + 114 * b) / 1_000) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buf(w: u32, h: u32, px: [u8; 4]) -> Vec<u8> {
        let mut v = vec![0u8; (w * h * 4) as usize];
        for c in v.as_chunks_mut::<4>().0 {
            c.copy_from_slice(&px);
        }
        v
    }
    fn paint(b: &mut [u8], w: u32, x0: u32, y0: u32, x1: u32, y1: u32, px: [u8; 4]) {
        for y in y0..y1 {
            for x in x0..x1 {
                let i = ((y * w + x) * 4) as usize;
                b[i..i + 4].copy_from_slice(&px);
            }
        }
    }
    /// 7×7-module QR finder pattern (dark ring + light gap + dark
    /// core) drawn at pixel origin (ox, oy) with `m` px per module —
    /// the same procedural-drawing rule the pixel tests follow.
    fn finder(b: &mut [u8], w: u32, ox: u32, oy: u32, m: u32) {
        paint(b, w, ox, oy, ox + 7 * m, oy + 7 * m, [20, 20, 20, 255]);
        paint(
            b,
            w,
            ox + m,
            oy + m,
            ox + 6 * m,
            oy + 6 * m,
            [235, 235, 235, 255],
        );
        paint(
            b,
            w,
            ox + 2 * m,
            oy + 2 * m,
            ox + 5 * m,
            oy + 5 * m,
            [20, 20, 20, 255],
        );
    }
    fn f<'a>(w: u32, h: u32, rgba: &'a [u8]) -> PixelFrame<'a> {
        PixelFrame {
            width: w,
            height: h,
            rgba,
        }
    }
    const WHOLE: Rect = Rect {
        x: 0,
        y: 0,
        w: 96,
        h: 96,
    };

    #[test]
    fn synthetic_qr_emits_qr_present() {
        // Light page, three finders at QR corner positions plus noise —
        // enough structure for the closed label, nothing else.
        let mut b = buf(96, 96, [240, 240, 240, 255]);
        finder(&mut b, 96, 8, 8, 2); // top-left
        finder(&mut b, 96, 72, 8, 2); // top-right
        finder(&mut b, 96, 8, 72, 2); // bottom-left
        let out = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        assert!(out
            .signals
            .iter()
            .any(|s| s.signal == RiskSignal::QrPresent));
    }

    #[test]
    fn single_finder_stays_silent() {
        // Precision bar: one finder can be noise — a QR needs ≥2
        // candidates per axis. This is the corroboration rule's edge
        // case, pinned as a test (ADR-0020).
        let mut b = buf(96, 96, [240, 240, 240, 255]);
        finder(&mut b, 96, 8, 8, 2);
        let out = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        assert!(out.signals.is_empty());
    }

    #[test]
    fn equal_width_stripes_do_not_match_ratio() {
        // 1:1:1:1:1 stripes look like runs but the middle bar is not
        // 3× — the ratio check is the discriminator.
        let mut b = buf(96, 96, [240, 240, 240, 255]);
        for x in (8..88).step_by(10) {
            paint(&mut b, 96, x, 8, x + 5, 88, [20, 20, 20, 255]);
        }
        let out = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        assert!(out.signals.is_empty());
    }

    #[test]
    fn photo_gradient_stays_silent() {
        let mut b = buf(96, 96, [0, 0, 0, 255]);
        for y in 0..96u32 {
            let l = 80 + (y as u8);
            paint(&mut b, 96, 0, y, 96, y + 1, [l, l, l, 255]);
        }
        let out = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        assert!(out.signals.is_empty());
    }

    #[test]
    fn decoupled_axis_hits_do_not_confirm_corners() {
        // Precision pin for organic UI noise: vertical finder-ratio
        // stripes in the top-right produce row hits (x-centers) and
        // horizontal finder-ratio bars in the bottom-left produce
        // column hits (y-centers), but no row-center × column-center
        // crossing lands on a dark core — the stripes stop at y=50
        // and the bars stop at x=50, so every crossing is light.
        let mut b = buf(96, 96, [240, 240, 240, 255]);
        for &x0 in &[60u32, 78] {
            paint(&mut b, 96, x0, 0, x0 + 2, 50, [20, 20, 20, 255]);
            paint(&mut b, 96, x0 + 4, 0, x0 + 10, 50, [20, 20, 20, 255]);
            paint(&mut b, 96, x0 + 12, 0, x0 + 14, 50, [20, 20, 20, 255]);
        }
        for &y0 in &[60u32, 78] {
            paint(&mut b, 96, 0, y0, 50, y0 + 2, [20, 20, 20, 255]);
            paint(&mut b, 96, 0, y0 + 4, 50, y0 + 10, [20, 20, 20, 255]);
            paint(&mut b, 96, 0, y0 + 12, 50, y0 + 14, [20, 20, 20, 255]);
        }
        let out = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        assert!(out.signals.is_empty());
    }

    #[test]
    fn malformed_frame_fails_closed() {
        let b = vec![0u8; 10];
        assert!(classify(&f(4, 4, &b), &[WHOLE]).is_none());
    }

    #[test]
    fn output_carries_no_pixels_and_deterministic_digest() {
        let mut b = buf(96, 96, [240, 240, 240, 255]);
        finder(&mut b, 96, 8, 8, 2);
        finder(&mut b, 96, 72, 8, 2);
        finder(&mut b, 96, 8, 72, 2);
        let a = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        let c = classify(&f(96, 96, &b), &[WHOLE]).unwrap();
        assert_eq!(a.content_digest, c.content_digest);
        assert!(a.content_digest.starts_with("sha256:"));
        assert_eq!(std::mem::size_of::<ExtractedSignal>(), 20);
    }
}
