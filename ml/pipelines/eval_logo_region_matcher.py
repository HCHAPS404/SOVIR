#!/usr/bin/env python3
"""Baseline eval for the DOM-guided logo-region matcher (ADR-0024).

Direction under test: the extension extractor emits candidate logo
regions (img/svg in header, nav or logo-* containers + top-zone images)
and the local ONNX voter embeds each crop against per-brand prototype
banks instead of guessing a top-left patch.

The learned artifact is NOT_RUN (train_visual.py needs torch + dataset
approval), so this script measures the strongest thing that CAN be
measured today: a non-learned hash matcher over the real logo crops in
Phishpedia's expand_targetlist. These numbers are the floor the learned
matcher must beat — and they also size the DOM-region cost: matching N
region crops per page against M brands.

Protocol (no training data leaks):
  * Every logo PNG → aHash(8x8) and dHash(8x8) bitstrings.
  * Leave-one-out per brand (brands with >=2 images): held-out image's
    minimum Hamming distance to its own brand = the "hit" distance;
    minimum distance to any OTHER brand = the "false accept" distance.
  * Report recall@threshold and cross-brand FP@threshold for thresholds
    4..24 of 64 bits, plus the strict-AND combo aHash+dHash.

Output: stdout table + ml/artifacts/logo-matcher-baseline.json (metrics
only, no image data).

STATUS: real eval on real crops; learned-matcher eval remains
NOT_IMPLEMENTED until the ONNX artifact exists.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGETLIST = ROOT / "ml/datasets/phishpedia/expand_targetlist/expand_targetlist"
OUT = ROOT / "ml/artifacts/logo-matcher-baseline.json"
HASH_SIDE = 8


def ahash(img):
    g = img.convert("L").resize((HASH_SIDE, HASH_SIDE))
    px = list(g.getdata())
    mean = sum(px) / len(px)
    return [p >= mean for p in px]


def dhash(img):
    g = img.convert("L").resize((HASH_SIDE + 1, HASH_SIDE))
    px = g.load()
    return [px[x, y] > px[x + 1, y] for y in range(HASH_SIDE) for x in range(HASH_SIDE)]


def hamming(a, b):
    return sum(x != y for x, y in zip(a, b))


def main():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("PIL required — run under ml/.venv or install pillow")

    brands = {}
    for brand_dir in sorted(TARGETLIST.iterdir()):
        if not brand_dir.is_dir():
            continue
        hashes = []
        for png in sorted(brand_dir.glob("*.png")) + sorted(brand_dir.glob("*.jpg")):
            try:
                with Image.open(png) as im:
                    hashes.append((ahash(im), dhash(im)))
            except Exception:
                continue  # corrupt crop — skipped, never guessed
        if hashes:
            brands[brand_dir.name] = hashes

    n_imgs = sum(len(v) for v in brands.values())
    multi = {b: v for b, v in brands.items() if len(v) >= 2}
    print(f"brands={len(brands)} images={n_imgs} multi-image brands={len(multi)}")

    # Leave-one-out distances.
    loo_same_a, loo_same_d, loo_cross_a, loo_cross_d = [], [], [], []
    for brand, hashes in multi.items():
        for i in range(len(hashes)):
            held = hashes[i]
            own = [h for j, h in enumerate(hashes) if j != i]
            loo_same_a.append(min(hamming(held[0], h[0]) for h in own))
            loo_same_d.append(min(hamming(held[1], h[1]) for h in own))
            best_a, best_d = 64, 64
            for other, ohs in brands.items():
                if other == brand:
                    continue
                for oh in ohs:
                    best_a = min(best_a, hamming(held[0], oh[0]))
                    best_d = min(best_d, hamming(held[1], oh[1]))
            loo_cross_a.append(best_a)
            loo_cross_d.append(best_d)

    thresholds = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24]
    n = len(loo_same_a)
    rows = []
    print(f"\n{'thr':>4} | {'aHash rec':>10} {'aHash FP':>10} | "
          f"{'dHash rec':>10} {'dHash FP':>10} | {'AND rec':>8} {'AND FP':>8}")
    for t in thresholds:
        ra = sum(d <= t for d in loo_same_a) / n
        fa = sum(d <= t for d in loo_cross_a) / n
        rd = sum(d <= t for d in loo_same_d) / n
        fd = sum(d <= t for d in loo_cross_d) / n
        rand = sum(a <= t and d <= t for a, d in zip(loo_same_a, loo_same_d)) / n
        fand = sum(a <= t and d <= t for a, d in zip(loo_cross_a, loo_cross_d)) / n
        rows.append({
            "threshold_bits": t,
            "ahash_recall": round(ra, 4), "ahash_fp": round(fa, 4),
            "dhash_recall": round(rd, 4), "dhash_fp": round(fd, 4),
            "and_recall": round(rand, 4), "and_fp": round(fand, 4),
        })
        print(f"{t:>4} | {ra:>10.3f} {fa:>10.3f} | {rd:>10.3f} {fd:>10.3f} | "
              f"{rand:>8.3f} {fand:>8.3f}")

    OUT.write_text(json.dumps({
        "version": "logo-matcher-baseline.v1",
        "dataset": "phishpedia expand_targetlist",
        "protocol": "leave-one-out aHash/dHash-8x8, same-brand recall vs cross-brand FP",
        "brands": len(brands), "images": n_imgs,
        "loo_samples": n, "rows": rows,
        "learned_eval": "NOT_IMPLEMENTED — visual.onnx artifact NOT_RUN",
    }, indent=2))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
