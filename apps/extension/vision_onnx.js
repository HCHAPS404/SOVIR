// SOVIR visual ONNX voter — ADR-0024, edge-side learned analyzer.
// PURE module like vision.js: no DOM, no chrome APIs except an optional
// artifact fetch the caller injects. The model artifact (models/
// visual.onnx + models/prototypes.json) ships inside the extension
// package when approved; absent, unloadable or unlicensed → abstain.
// Never guesses: any failure yields zero signals.
//
// Scheme (Phishpedia direction, no code port): the ONNX model is an
// embedding encoder; prototypes.json holds per-brand prototype vectors
// + that brand's legit domains. A page whose frame embeds near a brand
// prototype while its host is NOT one of that brand's domains gets
// AUTHORITY_IMPERSONATION — the closed-taxonomy signal for visual brand
// spoofing. Pixels never leave the worker; only the enum crosses.
//
// `globalThis.ort` is the vendored onnxruntime-web session factory —
// injected by the loader or a test double; absent → abstain.

(function attach(global) {
  const INPUT_DIM = 224;
  // cosine-similarity bar in basis points of [0,1]×10000.
  const DEFAULT_THRESHOLD_BP = 6_500;

  let session = null;
  let manifest = null;
  let modelId = null;
  let runtime = null;

  function hostAllowed(host, domains) {
    const h = (host || "").toLowerCase();
    return domains.some((d) => h === d || h.endsWith("." + d));
  }

  // RGBA frame → NCHW float32 (ImageNet-ish normalize from manifest).
  function preprocess(frame) {
    const w = Math.min(frame.width, INPUT_DIM);
    const h = Math.min(frame.height, INPUT_DIM);
    const mean = manifest?.input?.mean ?? [0.485, 0.456, 0.406];
    const std = manifest?.input?.std ?? [0.229, 0.224, 0.225];
    const out = new Float32Array(3 * INPUT_DIM * INPUT_DIM);
    for (let y = 0; y < INPUT_DIM; y++) {
      for (let x = 0; x < INPUT_DIM; x++) {
        // letterbox-crop the top-left region where logos live; center the
        // sampled patch, never stretch.
        const sx = Math.min(w - 1, Math.floor((x / INPUT_DIM) * w));
        const sy = Math.min(h - 1, Math.floor((y / INPUT_DIM) * h));
        const i = (sy * frame.width + sx) * 4;
        const o = y * INPUT_DIM + x;
        out[o] = frame.data[i] / 255 / std[0] - mean[0] / std[0];
        out[INPUT_DIM * INPUT_DIM + o] =
          frame.data[i + 1] / 255 / std[1] - mean[1] / std[1];
        out[2 * INPUT_DIM * INPUT_DIM + o] =
          frame.data[i + 2] / 255 / std[2] - mean[2] / std[2];
      }
    }
    return out;
  }

  function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  // base64 → Float32Array: int8-quantized prototype vectors (/127),
  // row-major n_imgs×DIM, each row re-normalized once at load.
  function decodeBank(b64, nImgs, dim) {
    const bin = atob(b64);
    const i8 = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) i8[i] = bin.charCodeAt(i);
    const rows = [];
    for (let r = 0; r < nImgs; r++) {
      const row = new Float32Array(dim);
      let norm = 0;
      for (let i = 0; i < dim; i++) {
        row[i] = i8[r * dim + i] / 127;
        norm += row[i] * row[i];
      }
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) row[i] /= norm;
      rows.push(row);
    }
    return rows;
  }

  // modelBytes: ArrayBuffer of the .onnx artifact; proto: parsed
  // prototypes.json {model_id, input?, threshold_bp?, brands:[{id,
  // domains, vector}]}. Returns true when the session is usable.
  function embDim(proto) {
    return proto.embedding_dim ?? 576;
  }

  async function load(modelBytes, proto, ort) {
    const rt = ort ?? global.ort;
    // Any load attempt resets state — a refused/crashed load must not
    // leave a previous artifact silently serving.
    session = null;
    manifest = null;
    runtime = null;
    if (
      !rt?.InferenceSession?.create ||
      !proto?.brands?.length ||
      !proto.brands.every((b) => typeof b.vectors_i8_b64 === "string" && b.n_imgs > 0)
    )
      return false;
    try {
      const newSession = await rt.InferenceSession.create(modelBytes);
      // Pre-decode banks into a NEW manifest — never mutate the caller's
      // proto (tests reuse it; a second load would see deleted fields).
      const dim = embDim(proto);
      const brands = proto.brands.map((b) => ({
        ...b,
        _rows: decodeBank(b.vectors_i8_b64, b.n_imgs, dim),
      }));
      session = newSession;
      manifest = { ...proto, brands };
      modelId = proto.model_id ?? "onnx-visual";
      runtime = rt;
      return true;
    } catch {
      session = null;
      manifest = null;
      runtime = null;
      return false;
    }
  }

  function loaded() {
    return session !== null && manifest !== null;
  }

  // frame: {data,width,height}; host: page hostname for the domain check.
  // → {signals:[], model_id, brand?, score_bp} | null (bad input).
  async function analyze(frame, host) {
    if (
      !frame ||
      !frame.data ||
      !frame.width ||
      !frame.height ||
      frame.data.length < frame.width * frame.height * 4
    )
      return null;
    if (!loaded()) return { signals: [], abstained: "no_artifact" };
    try {
      const input = preprocess(frame);
      const tensor = new runtime.Tensor(
        "float32",
        input,
        [1, 3, INPUT_DIM, INPUT_DIM],
      );
      const out = await session.run({ [session.inputNames[0]]: tensor });
      const emb = out[session.outputNames[0]].data;
      let best = { brand: null, score: 0 };
      for (const b of manifest.brands) {
        for (const row of b._rows) {
          const s = cosine(emb, row);
          if (s > best.score) best = { brand: b, score: s };
        }
      }
      const thr = (manifest.threshold_bp ?? DEFAULT_THRESHOLD_BP) / 10_000;
      if (!best.brand || best.score < thr || hostAllowed(host, best.brand.domains))
        return { signals: [], model_id: modelId };
      return {
        signals: ["AUTHORITY_IMPERSONATION"],
        model_id: modelId,
        brand: best.brand.id,
        score_bp: Math.round(best.score * 10_000),
      };
    } catch {
      return { signals: [], abstained: "inference_failed" };
    }
  }

  global.sovirVisionOnnx = { load, loaded, analyze, INPUT_DIM };
})(globalThis);
