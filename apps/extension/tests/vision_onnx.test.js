import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Pure module — load vision_onnx.js and grab the attached global.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "vision_onnx.js"), "utf8");
const voter = new Function(`${src}; return globalThis.sovirVisionOnnx;`)();
assert.ok(voter?.load, "sovirVisionOnnx attached");

function frame(w = 32, h = 32) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([200, 100, 50, 255], i);
  return { data, width: w, height: h };
}

// Fake onnxruntime: session.run returns a fixed embedding; Tensor is a
// data holder so the preprocess output shape can be asserted.
const fakeOrt = (embedding) => ({
  Tensor: class {
    constructor(type, data, dims) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  },
  InferenceSession: {
    create: async () => ({
      inputNames: ["input"],
      outputNames: ["emb"],
      run: async () => ({ emb: { data: embedding } }),
    }),
  },
});

// int8-quantized bank: one image vector [127,0,0] → dequantizes to
// [1,0,0] after /127 + L2-norm. embedding_dim=3 keeps the test small.
const PROTO = {
  model_id: "test-visual-0",
  threshold_bp: 5000,
  embedding_dim: 3,
  brands: [
    { id: "acme", domains: ["acme.com"], n_imgs: 1, vectors_i8_b64: "fwAA" },
  ],
};

test("no runtime or no brands → load refuses, analyze abstains", async () => {
  assert.equal(await voter.load(new ArrayBuffer(8), PROTO, null), false);
  assert.equal(await voter.load(new ArrayBuffer(8), { brands: [] }, fakeOrt([1])), false);
  assert.equal(
    await voter.load(
      new ArrayBuffer(8),
      { brands: [{ id: "x", domains: [], vector: [1, 0, 0] }] },
      fakeOrt([1]),
    ),
    false,
    "old centroid format refused — only int8 banks",
  );
  const r = await voter.analyze(frame(), "evil.example");
  assert.deepEqual(r.signals, []);
  assert.equal(r.abstained, "no_artifact");
});

test("session create throwing → load fails closed", async () => {
  const broken = { InferenceSession: { create: async () => { throw new Error("bad artifact"); } } };
  assert.equal(await voter.load(new ArrayBuffer(8), PROTO, broken), false);
  assert.equal(voter.loaded(), false);
});

test("bad frame input → null, never a guess", async () => {
  await voter.load(new ArrayBuffer(8), PROTO, fakeOrt([1, 0, 0]));
  assert.equal(await voter.analyze(null, "x"), null);
  assert.equal(await voter.analyze({ data: new Uint8ClampedArray(4), width: 9, height: 9 }, "x"), null);
});

test("brand match on foreign host → AUTHORITY_IMPERSONATION", async () => {
  assert.equal(await voter.load(new ArrayBuffer(8), PROTO, fakeOrt(new Float32Array([1, 0, 0]))), true);
  const r = await voter.analyze(frame(), "acme-login.evil.example");
  assert.deepEqual(r.signals, ["AUTHORITY_IMPERSONATION"]);
  assert.equal(r.brand, "acme");
  assert.equal(r.model_id, "test-visual-0");
});

test("same match on the brand's own domain → silent", async () => {
  await voter.load(new ArrayBuffer(8), PROTO, fakeOrt(new Float32Array([1, 0, 0])));
  for (const host of ["acme.com", "www.acme.com", "login.acme.com"]) {
    const r = await voter.analyze(frame(), host);
    assert.deepEqual(r.signals, [], host);
  }
});

test("embedding below threshold → silent", async () => {
  await voter.load(new ArrayBuffer(8), PROTO, fakeOrt(new Float32Array([0, 1, 0])));
  const r = await voter.analyze(frame(), "evil.example");
  assert.deepEqual(r.signals, []);
});

test("inference throwing → abstains, not a crash or a guess", async () => {
  const ort = fakeOrt([1, 0, 0]);
  ort.InferenceSession.create = async () => ({
    inputNames: ["input"],
    outputNames: ["emb"],
    run: async () => { throw new Error("oom"); },
  });
  await voter.load(new ArrayBuffer(8), PROTO, ort);
  const r = await voter.analyze(frame(), "evil.example");
  assert.deepEqual(r.signals, []);
  assert.equal(r.abstained, "inference_failed");
});
