import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Pure module — load vision.js and grab the attached global.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "vision.js"), "utf8");
const scan = new Function(`${src}; return globalThis.sovirVisionScan;`)();
assert.ok(typeof scan === "function", "sovirVisionScan attached");

// ---------------------------------------------------------------------------
// Synthetic frame painters — same rule as the Rust twin: pixels are drawn
// procedurally, no real captures in tests (ADR-0020 eval rule).
// ---------------------------------------------------------------------------
const LIGHT = [240, 240, 240, 255];
const DARK = [20, 20, 20, 255];

function blank(w, h, px = LIGHT) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(px, i);
  return { data, width: w, height: h };
}

function paint(img, x0, y0, x1, y1, px) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      img.data.set(px, (y * img.width + x) * 4);
    }
  }
}

// 7×7-module QR finder at (ox, oy), `m` px per module.
function finder(img, ox, oy, m) {
  paint(img, ox, oy, ox + 7 * m, oy + 7 * m, DARK);
  paint(img, ox + m, oy + m, ox + 6 * m, oy + 6 * m, LIGHT);
  paint(img, ox + 2 * m, oy + 2 * m, ox + 5 * m, oy + 5 * m, DARK);
}

test("synthetic QR (three finders) emits QR_PRESENT", () => {
  const img = blank(96, 96);
  finder(img, 8, 8, 2); // top-left
  finder(img, 72, 8, 2); // top-right
  finder(img, 8, 72, 2); // bottom-left
  const res = scan(img);
  assert.ok(res.signals.includes("QR_PRESENT"));
});

test("single finder stays silent — corroboration bar", () => {
  const img = blank(96, 96);
  finder(img, 8, 8, 2);
  const res = scan(img);
  assert.deepEqual(res.signals, []);
});

test("equal-width stripes fail the 1:1:3:1:1 ratio", () => {
  const img = blank(96, 96);
  for (let x = 8; x < 88; x += 10) paint(img, x, 8, x + 5, 88, DARK);
  const res = scan(img);
  assert.deepEqual(res.signals, []);
});

test("photo-like gradient stays silent", () => {
  const img = blank(96, 96, [0, 0, 0, 255]);
  for (let y = 0; y < 96; y++) {
    const l = 80 + y;
    paint(img, 0, y, 96, y + 1, [l, l, l, 255]);
  }
  const res = scan(img);
  assert.deepEqual(res.signals, []);
});

test("decoupled axis hits do not confirm corners", () => {
  // Same pin as the Rust twin: vertical finder-ratio stripes (top-
  // right) give row hits, horizontal finder-ratio bars (bottom-left)
  // give column hits — but every crossing lands on light background.
  const img = blank(96, 96);
  for (const x0 of [60, 78]) {
    paint(img, x0, 0, x0 + 2, 50, DARK);
    paint(img, x0 + 4, 0, x0 + 10, 50, DARK);
    paint(img, x0 + 12, 0, x0 + 14, 50, DARK);
  }
  for (const y0 of [60, 78]) {
    paint(img, 0, y0, 50, y0 + 2, DARK);
    paint(img, 0, y0 + 4, 50, y0 + 10, DARK);
    paint(img, 0, y0 + 12, 50, y0 + 14, DARK);
  }
  const res = scan(img);
  assert.deepEqual(res.signals, []);
});

test("malformed input fails closed", () => {
  assert.equal(scan(null), null);
  assert.equal(scan({ data: new Uint8ClampedArray(10), width: 4, height: 4 }), null);
});

test("downsamples oversized captures — scan stays bounded", () => {
  // 2048px side must shrink to <=1024; a big QR still resolves.
  const img = blank(2048, 2048);
  finder(img, 100, 100, 20);
  finder(img, 1500, 100, 20);
  finder(img, 100, 1500, 20);
  const res = scan(img);
  assert.ok(res.frame.width <= 1024 && res.frame.height <= 1024);
  assert.ok(res.signals.includes("QR_PRESENT"));
});

test("returned frame is the analyzed buffer, signals only enums", () => {
  const img = blank(96, 96);
  finder(img, 8, 8, 2);
  finder(img, 72, 8, 2);
  finder(img, 8, 72, 2);
  const res = scan(img);
  assert.deepEqual(Object.keys(res).sort(), ["frame", "signals"]);
  assert.ok(res.signals.every((s) => typeof s === "string"));
  assert.ok(res.frame.data instanceof Uint8ClampedArray);
});
