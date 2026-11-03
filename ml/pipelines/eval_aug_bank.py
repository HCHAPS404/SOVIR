#!/usr/bin/env python3
"""Augmented-prototype experiment for the logo matcher (ADR-0024).

Measured failure mode (eval_logo_region_matcher + benign corpus): pure
logo-crop prototypes match whole-page queries by LAYOUT, not identity —
benign homepages scored higher (mean .834) than phishing ones (.735).

Hypothesis under test: augmenting the BANK side with "logo-in-page-context"
variants (white header pad, dark header pad, blurred pad) closes the
modality gap for page-region queries WITHOUT blowing up cross-brand FP.

Protocol:
  * bank_pure — same-brand vectors from raw logo files (the shipped idea).
  * bank_aug  — same + 3 augmented variants per logo (white pad, dark pad,
    blurred white pad), simulating a logo pasted into a page header.
  * Queries — the real corpora: 400 phishing screenshots (recall side),
    130 benign homepages (FP side), and tight-crop LOO for selectivity
    (the query logo AND its own augmented variants are excluded from the
    bank so self-matches cannot inflate recall).

Report: recall/FP at thr 0.85/0.90/0.95 for pure vs aug → stdout + JSON.
Usage:
    ml/.venv/Scripts/python.exe ml/pipelines/eval_aug_bank.py [--cap 4]
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ART = ROOT / "ml/artifacts/onnx-visual"
TARGETLIST = ROOT / "ml/datasets/phishpedia/expand_targetlist/expand_targetlist"
CORPUS_PHISH = ROOT / "ml/datasets/eval-corpus-vision.v1.json"
CORPUS_BENIGN = ROOT / "ml/datasets/eval-corpus-vision-benign.v1.json"
OUT = ROOT / "ml/artifacts/aug-bank-eval.json"
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


def augment(img, Image, ImageFilter):
    """Logo pasted into synthetic page-header contexts."""
    img = img.convert("RGB")
    w, h = img.size
    side = max(w, h) * 3
    white = Image.new("RGB", (side, side), (255, 255, 255))
    dark = Image.new("RGB", (side, side), (26, 26, 30))
    off = ((side - w) // 2, (side - h) // 2)
    white.paste(img, off)
    dark.paste(img, off)
    return [white, dark, white.filter(ImageFilter.GaussianBlur(1.5))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=4, help="logos per brand")
    args = ap.parse_args()
    try:
        import numpy as np
        import onnxruntime as ort
        from PIL import Image, ImageFilter
    except ImportError:
        sys.exit("numpy/onnxruntime/PIL required — run under ml/.venv")

    proto = json.loads((ART / "prototypes.json").read_text())
    bank_ids = set(b["id"] for b in proto["brands"])
    sess = ort.InferenceSession(str(ART / "visual.onnx"), providers=["CPUExecutionProvider"])
    inp, outp = sess.get_inputs()[0].name, sess.get_outputs()[0].name

    def embed(img):
        e = sess.run([outp], {inp: preprocess(img)})[0][0]
        return e / (np.linalg.norm(e) or 1.0)

    # ---- bank build: pure vs augmented (aug layout: [pure*n, aug*3n]) -------
    pure, aug, own_idx = {}, {}, {}
    n_fwd = 0
    for d in sorted(TARGETLIST.iterdir()):
        if not d.is_dir() or d.name not in bank_ids:
            continue
        imgs = sorted(d.glob("*.png")) + sorted(d.glob("*.jpg"))
        pv, av = [], []
        for p in imgs[: args.cap]:
            try:
                img = Image.open(p)
                pv.append(embed(img))
                for a in augment(img, Image, ImageFilter):
                    av.append(embed(a))
                n_fwd += 4
            except Exception:
                continue
        if pv:
            pure[d.name] = np.stack(pv)
            aug[d.name] = np.stack(pv + av)
            # index ranges to exclude during LOO for query logo i
            own_idx[d.name] = [(i, len(pv) + 3 * i) for i in range(len(pv))]
    brands = sorted(pure)
    print(f"bank: brands={len(brands)} fwd={n_fwd}")

    # ---- query side: real corpora -------------------------------------------
    def load_cases(path):
        data = json.loads(path.read_text())
        return data.get("cases", data) if isinstance(data, dict) else data

    def score_corpus(cases, bank, thr):
        hits, scored = 0, 0
        vecs = np.concatenate([bank[b] for b in brands])
        for c in cases:
            p = ROOT / c["screenshot"]
            if not p.exists():
                continue
            try:
                q = embed(Image.open(p))
            except Exception:
                continue
            scored += 1
            if float((vecs @ q).max()) >= thr:
                hits += 1
        return hits, scored

    # tight-crop LOO: query = raw logo i; bank excludes pure[i] AND its own
    # aug variants so self-derived vectors cannot self-match.
    def loo(bank, thr):
        same_hit = cross_hit = n = 0
        for bid in brands:
            bank_vecs = bank[bid]
            n_pure = len(pure[bid])
            others_bank = np.concatenate([bank[b] for b in brands if b != bid])
            for i, q in enumerate(pure[bid]):
                excl = {i}
                if len(bank_vecs) > n_pure:  # aug bank: drop own 3 variants
                    excl |= {n_pure + 3 * i + k for k in range(3)}
                rest = np.delete(bank_vecs, list(excl), axis=0)
                n += 1
                if len(rest) and float((rest @ q).max()) >= thr:
                    same_hit += 1
                if float((others_bank @ q).max()) >= thr:
                    cross_hit += 1
        return (same_hit / n if n else 0), (cross_hit / n if n else 0), n

    phish = load_cases(CORPUS_PHISH)
    benign = load_cases(CORPUS_BENIGN) if CORPUS_BENIGN.exists() else []
    rows = []
    for thr in (0.85, 0.90, 0.95):
        for name, bank in (("pure", pure), ("aug", aug)):
            hp, np_ = score_corpus(phish, bank, thr)
            hb, nb = score_corpus(benign, bank, thr) if benign else (0, 0)
            r, f, n = loo(bank, thr)
            rows.append({
                "thr": thr, "bank": name,
                "phish_recall": round(hp / np_ if np_ else 0, 4), "phish_n": np_,
                "benign_fp": round(hb / nb if nb else 0, 4), "benign_n": nb,
                "loo_same_recall": round(r, 4), "loo_cross_fp": round(f, 4), "loo_n": n,
            })
            print(
                f"thr={thr:.2f} {name:>4} | phish {hp}/{np_} | benignFP {hb}/{nb} | "
                f"loo same {r:.3f} cross {f:.3f}"
            )

    OUT.write_text(json.dumps({
        "version": "aug-bank.v1",
        "hypothesis": "page-context-augmented prototypes close logo-vs-page modality gap",
        "augment": "white 3x pad, dark 3x pad, blurred white pad; cap logos/brand",
        "rows": rows,
    }, indent=2))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
