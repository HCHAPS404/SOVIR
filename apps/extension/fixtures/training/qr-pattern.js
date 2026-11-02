// Synthetic QR-pattern renderer for SOVIR training fixtures.
// Draws a QR-*like* module grid on a canvas: three real 7x7 finder
// patterns (dark ring / light ring / dark 3x3 core) at the corners,
// timing strips, alignment square, and a deterministic pseudo-random
// module fill. It is NOT a decodable QR payload — the v0 classifier is
// a structural finder detector (1:1:3:1:1 runs + corner confirmation),
// so a structurally faithful pattern is the correct unit under test.
(function () {
  function finder(ctx, x, y, m) {
    // 7x7 finder: dark border, light ring, dark 3x3 core.
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, 7 * m, 7 * m);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + m, y + m, 5 * m, 5 * m);
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 2 * m, y + 2 * m, 3 * m, 3 * m);
  }

  window.sovirDrawQr = function (canvas, modules, seed) {
    const N = modules || 25; // version-2-ish density
    const ctx = canvas.getContext("2d");
    const quiet = 4; // quiet zone in modules
    const m = Math.floor(canvas.width / (N + quiet * 2));
    const off = Math.floor((canvas.width - m * (N + quiet * 2)) / 2) + quiet * m;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Deterministic pseudo-random fill (xorshift) for data modules.
    let s = seed || 0x9e3779b9;
    const rand = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 0xffffffff;
    };
    const inFinder = (r, c) =>
      (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);
    const inTiming = (r, c) => r === 6 || c === 6;
    const inAlign = (r, c) =>
      r >= N - 10 && r <= N - 6 && c >= N - 10 && c <= N - 6;

    ctx.fillStyle = "#000";
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (inFinder(r, c)) continue;
        if (inTiming(r, c)) {
          if ((r + c) % 2 === 0) ctx.fillRect(off + c * m, off + r * m, m, m);
          continue;
        }
        if (inAlign(r, c)) {
          const a = Math.max(Math.abs(r - (N - 8)), Math.abs(c - (N - 8)));
          if (a !== 1) ctx.fillRect(off + c * m, off + r * m, m, m);
          continue;
        }
        if (rand() < 0.42) ctx.fillRect(off + c * m, off + r * m, m, m);
      }
    }
    finder(ctx, off, off, m);
    finder(ctx, off + (N - 7) * m, off, m);
    finder(ctx, off, off + (N - 7) * m, m);
  };
})();
