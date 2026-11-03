#!/usr/bin/env python3
"""Measure the DOM-region hypothesis on synthetic phishing compositions.

Question answered offline: if the DOM hands the matcher a TIGHT logo
rect instead of the whole page, does brand matching recover?

Setup (no DOM needed): composite each held-out targetlist logo onto a
simulated phishing-page canvas (neutral header + content blocks at a
plausible logo slot), then score:

  A) whole-frame top-left crop  — today's default query
  B) tight logo rect            — what sovirExtractLogoRegions yields

against the shipped prototype bank. Recall@0.90 for correct brand +
max score distribution. This is the synthetic proxy for tomorrow's
live DOM-rect measurement — real <img> rects may be tighter still.

Usage:
    ml/.venv/Scripts/python.exe ml/pipelines/eval_logo_crop_value.py [--n 200]
"""
import argparse
import base64
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "ml/artifacts/onnx-visual"
TARGETLIST = ROOT / "ml/datasets/phishpedia/expand_targetlist/expand_targetlist"
INPUT_DIM = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
PAGE_W, PAGE_H = 1280, 800


def load_bank(proto):
    import numpy as np

    brands = {}
    for b in proto["brands"]:
        raw = np.frombuffer(base64.b64decode(b["vectors_i8_b64"]), dtype=np.int8)
        rows = raw.reshape(b["n_imgs"], proto["embedding_dim"]).astype(np.float32) / 127.0
        norms = np.linalg.norm(rows, axis=1, keepdims=True)
        rows = rows / np.where(norms == 0, 1.0, norms)
        brands[b["id"]] = rows
    return brands


def preprocess(img, region=None):
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


def sim_page(rng, logo, lw, lh, lx, ly):
    """Neutral phishing-ish canvas: white page, dark header band, form
    blocks — plausible geometry without copying any real site."""
    from PIL import Image, ImageDraw

    page = Image.new("RGB", (PAGE_W, PAGE_H), (248, 248, 250))
    d = ImageDraw.Draw(page)
    d.rectangle([0, 0, PAGE_W, 76], fill=(250, 250, 252))
    d.rectangle([0, 76, PAGE_W, 78], fill=(226, 226, 230))
    d.rectangle([PAGE_W // 2 - 260, 220, PAGE_W // 2 + 260, 560], fill=(255, 255, 255), outline=(228, 228, 232))
    d.rectangle([PAGE_W // 2 - 220, 300, PAGE_W // 2 + 220, 336], fill=(240, 240, 243))
    d.rectangle([PAGE_W // 2 - 220, 360, PAGE_W // 2 + 220, 396], fill=(240, 240, 243))
    d.rectangle([PAGE_W // 2 - 220, 430, PAGE_W // 2 + 220, 470], fill=(30, 98, 214))
    page.paste(logo.resize((lw, lh), Image.LANCZOS), (lx, ly))
    return page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()
    try:
        import numpy as np
        import onnxruntime as ort
        from PIL import Image
    except ImportError:
        sys.exit("numpy/onnxruntime/PIL required — run under ml/.venv")

    proto = json.loads((ARTIFACTS / "prototypes.json").read_text())
    brands = load_bank(proto)
    thr = proto.get("threshold_bp", 9000) / 10_000
    sess = ort.InferenceSession(str(ARTIFACTS / "visual.onnx"), providers=["CPUExecutionProvider"])
    inp, outp = sess.get_inputs()[0].name, sess.get_outputs()[0].name
    name_by_domains = {b["id"]: b["domains"] for b in proto["brands"]}

    rng = random.Random(args.seed)
    brand_dirs = [d for d in sorted(TARGETLIST.iterdir()) if d.is_dir()]
    rng.shuffle(brand_dirs)
    picked = brand_dirs[: args.n]

    def best_for(emb):
        emb = emb / (np.linalg.norm(emb) or 1.0)
        best, bid = 0.0, None
        for bid0, rows in brands.items():
            s = float((rows @ emb).max())
            if s > best:
                best, bid = s, bid0
        return best, bid

    norm = lambda s: s.lower().replace(" ", "_").replace("&", "and")
    hits_frame = hits_crop = correct_frame = correct_crop = 0
    score_frame, score_crop = [], []
    for brand_dir in picked:
        imgs = sorted(brand_dir.glob("*.png")) + sorted(brand_dir.glob("*.jpg"))
        if not imgs:
            continue
        logo = Image.open(rng.choice(imgs)).convert("RGB")
        lw, lh = rng.randint(110, 240), rng.randint(30, 64)
        lx, ly = rng.choice([rng.randint(20, 60), rng.randint(480, 700)]), rng.randint(8, 26)
        page = sim_page(rng, logo, lw, lh, lx, ly)

        emb_f = sess.run([outp], {inp: preprocess(page)})[0][0]
        emb_c = sess.run([outp], {inp: preprocess(page, (lx, ly, lw, lh))})[0][0]
        sf, bf = best_for(emb_f)
        sc, bc = best_for(emb_c)
        score_frame.append(sf)
        score_crop.append(sc)
        want = norm(brand_dir.name)
        if sf >= thr:
            hits_frame += 1
            if bf and norm(bf) == want:
                correct_frame += 1
        if sc >= thr:
            hits_crop += 1
            if bc and norm(bc) == want:
                correct_crop += 1

    n = len(score_frame)
    print(f"logos composited={n}  thr={thr}  bank brands={len(brands)}")
    print(f"\n{'query':<28} {'fires@0.90':>10} {'correct-brand':>14} {'mean score':>11}")
    print(f"{'whole frame (today)':<28} {hits_frame:>10} {correct_frame:>14} {sum(score_frame)/n:>11.3f}")
    print(f"{'tight logo crop (DOM rect)':<28} {hits_crop:>10} {correct_crop:>14} {sum(score_crop)/n:>11.3f}")
    print("\nIf tight-crop recall > whole-frame recall, the DOM-region")
    print("direction measurably fixes logo-vs-page BEFORE the live test.")


if __name__ == "__main__":
    main()
