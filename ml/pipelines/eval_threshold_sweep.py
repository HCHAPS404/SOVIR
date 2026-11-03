#!/usr/bin/env python3
"""Operating-point sweep for the logo-tight-crop matcher (ADR-0024).

The shipped bank + encoder at thr=0.90 was tuned for clean-logo
cross-false, not for page crops. The DOM-region pipeline changes the
QUERY side to tight logo crops — this script measures the recall/FP
curve for THAT query mode so threshold_bp is chosen with evidence:

  * recall side — leave-one-out within brand: each logo embeds vs its
    own brand's other vectors (the "hit" score).
  * FP side — leave-one-BRAND-out: each logo embeds vs every OTHER
    brand's vectors (a match is a cross-brand false accept).

Report: recall and FP at thresholds 0.75..0.95 → stdout + JSON.
Usage:
    ml/.venv/Scripts/python.exe ml/pipelines/eval_threshold_sweep.py [--cap 8]
"""
import argparse
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "ml/artifacts/onnx-visual"
TARGETLIST = ROOT / "ml/datasets/phishpedia/expand_targetlist/expand_targetlist"
OUT = ROOT / "ml/artifacts/logo-crop-threshold-sweep.json"
INPUT_DIM = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def preprocess(img):
    import numpy as np

    px = np.asarray(img.convert("RGB").resize((INPUT_DIM, INPUT_DIM)), dtype=np.float32) / 255.0
    out = np.empty((3, INPUT_DIM, INPUT_DIM), dtype=np.float32)
    for c in range(3):
        out[c] = px[..., c] / STD[c] - MEAN[c] / STD[c]
    return out[None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=6, help="logos per brand")
    ap.add_argument("--brands", type=int, default=241)
    args = ap.parse_args()
    try:
        import numpy as np
        import onnxruntime as ort
        from PIL import Image
    except ImportError:
        sys.exit("numpy/onnxruntime/PIL required — run under ml/.venv")

    proto = json.loads((ARTIFACTS / "prototypes.json").read_text())
    thr_now = proto.get("threshold_bp", 9000) / 10_000
    sess = ort.InferenceSession(str(ARTIFACTS / "visual.onnx"), providers=["CPUExecutionProvider"])
    inp, outp = sess.get_inputs()[0].name, sess.get_outputs()[0].name
    bank_ids = set(b["id"] for b in proto["brands"])

    # Embed every brand's logos once — bank ids are the raw folder names.
    embs = {}
    for d in sorted(TARGETLIST.iterdir()):
        if not d.is_dir():
            continue
        bid = d.name
        if bid not in bank_ids:
            continue
        imgs = sorted(d.glob("*.png")) + sorted(d.glob("*.jpg"))
        vecs = []
        for p in imgs[: args.cap]:
            try:
                e = sess.run([outp], {inp: preprocess(Image.open(p))})[0][0]
                vecs.append(e / (np.linalg.norm(e) or 1.0))
            except Exception:
                continue
        if vecs:
            embs[bid] = np.stack(vecs)

    brands = sorted(embs)
    print(f"embedded brands={len(brands)} logos={sum(len(v) for v in embs.values())}")

    # Distance bookkeeping: for each logo, best same-brand (excluding
    # itself) and best cross-brand score.
    same_scores, cross_scores = [], []
    for bid in brands:
        own = embs[bid]
        others = np.concatenate([embs[b] for b in brands if b != bid])
        for i, e in enumerate(own):
            rest = np.delete(own, i, axis=0)
            same_scores.append(float((rest @ e).max()) if len(rest) else 0.0)
            cross_scores.append(float((others @ e).max()))

    n = len(same_scores)
    thresholds = [0.75, 0.78, 0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.92, 0.95]
    rows = []
    print(f"\n{'thr':>5} {'recall':>8} {'FP':>8}")
    for t in thresholds:
        r = sum(s >= t for s in same_scores) / n
        f = sum(s >= t for s in cross_scores) / n
        rows.append({"thr": t, "recall": round(r, 4), "fp": round(f, 4)})
        print(f"{t:>5.2f} {r:>8.3f} {f:>8.3f}{'  <- shipped' if t == thr_now else ''}")

    OUT.write_text(json.dumps({
        "version": "logo-crop-sweep.v1", "protocol":
        "LOO same-brand recall vs leave-one-brand-out cross FP, tight logo crops",
        "brands": len(brands), "samples": n, "shipped_thr": thr_now, "rows": rows,
    }, indent=2))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
