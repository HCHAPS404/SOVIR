#!/usr/bin/env python3
"""Offline eval of the learned visual voter (ADR-0024) on the gated corpus.

Mirrors apps/extension/vision_onnx.js exactly:
  * preprocess  — top-left letterbox crop to 224², ImageNet mean/std,
                  NCHW float32 (same as the JS `preprocess()`)
  * prototype bank — int8-quantized rows, /127 then L2-normalized
                     (same as the JS `decodeBank()`)
  * decision    — max cosine over every image row of every brand;
                  signal iff score >= threshold_bp/1e4 AND host not in
                  that brand's curated domains

Corpus: ml/datasets/eval-corpus-vision.v1.json — 400 Phishpedia cases,
each expects AUTHORITY_IMPERSONATION. Reports recall overall + failure
breakdown (under-threshold vs wrong-brand vs own-domain) so misses are
attributable. The benign side (legit domains must stay silent) is the
separate corpus — see eval-corpus-vision-benign.* when populated.

Usage:
    ml/.venv/Scripts/python.exe ml/pipelines/eval_vision_onnx.py [corpus.json]
  corpus defaults to the phishing split; pass the benign corpus to
  measure the FP side (expect_signal "none" cases count fires as FP and
  record the best-matching brand/score as near-miss evidence).
"""
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "ml/artifacts/onnx-visual"
CORPUS = ROOT / "ml/datasets/eval-corpus-vision.v1.json"
INPUT_DIM = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def load_bank(proto):
    """b64 int8 rows -> Float32 L2-normalized (JS decodeBank twin)."""
    import numpy as np

    brands = []
    for b in proto["brands"]:
        raw = np.frombuffer(base64.b64decode(b["vectors_i8_b64"]), dtype=np.int8)
        rows = raw.reshape(b["n_imgs"], proto["embedding_dim"]).astype(np.float32) / 127.0
        norms = np.linalg.norm(rows, axis=1, keepdims=True)
        rows = rows / np.where(norms == 0, 1.0, norms)
        brands.append({"id": b["id"], "domains": b["domains"], "rows": rows})
    return brands


def preprocess(img, region=None):
    """224^2 NCHW — JS preprocess(frame, region) twin. Region = (x,y,w,h)
    crop in image pixels; absent → top-left letterbox."""
    import numpy as np

    px = np.asarray(img, dtype=np.float32) / 255.0
    H, W = px.shape[:2]
    if region is None:
        rx, ry, rw, rh = 0, 0, min(W, INPUT_DIM), min(H, INPUT_DIM)
    else:
        rx = max(0, min(W - 1, int(region[0])))
        ry = max(0, min(H - 1, int(region[1])))
        rw = max(1, min(W - rx, int(region[2])))
        rh = max(1, min(H - ry, int(region[3])))
    xs = np.minimum(rx + rw - 1, rx + (np.arange(INPUT_DIM) / INPUT_DIM * rw).astype(int))
    ys = np.minimum(ry + rh - 1, ry + (np.arange(INPUT_DIM) / INPUT_DIM * rh).astype(int))
    patch = px[np.ix_(ys, xs)]
    out = np.empty((3, INPUT_DIM, INPUT_DIM), dtype=np.float32)
    for c in range(3):
        out[c] = patch[..., c] / STD[c] - MEAN[c] / STD[c]
    return out[None]


def candidate_regions(w, h):
    """Simulated DOM-region candidates: header-band tiles where phishing
    kits put the impersonated logo — top strip, left block, centered
    block, plus a top-half sweep. Approximation of what
    sovirExtractLogoRegions yields when it hits: honest upper bound for
    the DOM-guided direction on screenshots that lack DOM."""
    zones = [
        (0, 0, w * 0.4, h * 0.18),      # top-left header block
        (0, 0, w, h * 0.15),            # full top strip
        (w * 0.3, 0, w * 0.4, h * 0.2), # top-center logo slot
        (0, 0, w * 0.5, h * 0.3),       # generous header quadrant
        (w * 0.25, h * 0.05, w * 0.5, h * 0.3),
    ]
    return [(x, y, ww, hh) for x, y, ww, hh in zones]


def host_allowed(host, domains):
    h = (host or "").lower()
    return any(h == d or h.endswith("." + d) for d in domains)


def main():
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError:
        sys.exit("numpy/onnxruntime required — run under ml/.venv")

    proto = json.loads((ARTIFACTS / "prototypes.json").read_text())
    brands = load_bank(proto)
    thr = proto.get("threshold_bp", 9000) / 10_000
    sess = ort.InferenceSession(
        str(ARTIFACTS / "visual.onnx"), providers=["CPUExecutionProvider"]
    )
    inp, outp = sess.get_inputs()[0].name, sess.get_outputs()[0].name

    corpus_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else CORPUS
    corpus = json.loads(pathlib.Path(corpus_path).read_text())
    cases = corpus["cases"]
    benign = all(c.get("expect_signal") == "none" for c in cases)
    print(f"model={proto['model_id']} brands={len(brands)} thr={thr} "
          f"cases={len(cases)} side={'benign' if benign else 'phishing'}")

    from PIL import Image

    hit = 0
    region_hit = 0
    under_thr, wrong_brand, own_domain, missing = 0, 0, 0, 0
    fp_fires = []
    score_sum = 0.0
    region_scores = []
    near_misses = []
    for c in cases:
        shot = ROOT / c["screenshot"]
        if not shot.exists():
            missing += 1
            continue
        img = Image.open(shot).convert("RGB")
        w, h = img.size
        crops = [None] + candidate_regions(w, h)
        embs = []
        for crop in crops:
            e = sess.run([outp], {inp: preprocess(img, crop)})[0][0]
            e = e / (np.linalg.norm(e) or 1.0)
            embs.append(e)
        # Fallback crop only (current extension behaviour).
        emb = embs[0]
        # DOM-guided upper bound: max over ALL candidate crops —
        # analyze() iterates [fallback] + regions and takes the max.
        best_brand, best = None, 0.0
        region_best, region_brand = 0.0, None
        for b in brands:
            s0 = float((b["rows"] @ emb).max())
            if s0 > best:
                best, best_brand = s0, b
            s_max = max(float((b["rows"] @ e).max()) for e in embs)
            if s_max > region_best:
                region_best, region_brand = s_max, b
        score_sum += best
        region_scores.append(region_best)
        fired = best_brand is not None and best >= thr and not host_allowed(c["host"], best_brand["domains"])
        r_fired = region_brand is not None and region_best >= thr and not host_allowed(c["host"], region_brand["domains"])
        # Near-miss evidence even when the domain check silences the
        # fire: a legit page scoring >=thr for a brand it is NOT is a
        # cross-brand false match in waiting.
        if best_brand is not None and best >= thr * 0.92:
            near_misses.append((c["id"], c["host"], best_brand["id"], round(best, 3)))
        if benign:
            if fired:
                fp_fires.append((c["id"], c["host"], best_brand["id"], round(best, 3)))
            if r_fired:
                region_hit += 1
            continue
        if fired:
            hit += 1
            if c["expect_brand"] and best_brand["id"] != c["expect_brand"]:
                wrong_brand += 1
        elif best_brand is not None and best >= thr:
            own_domain += 1
        else:
            under_thr += 1
        if r_fired:
            region_hit += 1

    n = len(cases) - missing
    if benign:
        print(f"\nbenign FP fires         : {len(fp_fires)}/{n} = {len(fp_fires)/max(n,1):.3f}"
              f" | region-guided FP: {region_hit}/{n}")
        for row in fp_fires[:15]:
            print(f"   FP {row[0]} {row[1]} -> {row[2]} @ {row[3]}")
        print(f"  near-misses (>=92%thr) : {len(near_misses)}")
        for row in near_misses[:15]:
            print(f"   ~ {row[0]} {row[1]} -> {row[2]} @ {row[3]}")
        print(f"  mean best-score        : {score_sum/max(n,1):.3f} frame | "
              f"{sum(region_scores)/max(n,1):.3f} best-crop")
    else:
        print(f"\nwhole-frame recall      : {hit}/{n} = {hit/n:.3f}" if n else "no cases")
        print(f"region-guided (sim)     : {region_hit}/{n} = {region_hit/n:.3f}" if n else "")
        print(f"  under-threshold misses : {under_thr}")
        print(f"  matched own domain     : {own_domain} (silence = correct)")
        print(f"  fired, wrong brand     : {wrong_brand} (still a true signal — foreign host)")
        print(f"  missing screenshots    : {missing}")
        print(f"  mean best-score        : {score_sum/max(n,1):.3f} frame | "
              f"{sum(region_scores)/max(n,1):.3f} best-crop")
        print("\nNOTE: region-guided is a tile SIMULATION of DOM candidates —")
        print("real DOM rects arrive via sovirExtractLogoRegions at run time.")


if __name__ == "__main__":
    main()
