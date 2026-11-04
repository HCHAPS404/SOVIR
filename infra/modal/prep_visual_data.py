#!/usr/bin/env python3
"""Pack the visual-training subset and upload it to the Modal volume.

Collects (repo-relative, synthetic/public corpora only — no user content):
  * ml/datasets/phishpedia/expand_targetlist/expand_targetlist/<brand>/*.png  (all)
  * ml/datasets/phishpedia/phish_30k/<brand+ts>/{shot.png,yolo_coords.txt,info.txt}
      — capped per brand, shuffled deterministically
  * ml/datasets/benign-brands/*.png                                            (all)
  * ml/brand-domains.json, ml/datasets/eval-corpus-vision*.json                (eval)

Run:  .venv-modal/Scripts/python infra/modal/prep_visual_data.py [--per-brand 25]
Then: .venv-modal/Scripts/python -m modal volume put sovir-ml-data <tar> /visual-data.tar
"""
from __future__ import annotations

import argparse
import json
import random
import tarfile
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PHISH = ROOT / "ml/datasets/phishpedia/phish_30k"
LOGOS = ROOT / "ml/datasets/phishpedia/expand_targetlist/expand_targetlist"
BENIGN = ROOT / "ml/datasets/benign-brands"
OUT = ROOT / "ml/artifacts/visual-data.tar"


def brand_of(case_dir: pathlib.Path) -> str:
    """info.txt['brand'] is ground truth; the dirname suffix is a fallback."""
    try:
        info = json.loads(case_dir.joinpath("info.txt").read_text())
        if info.get("brand"):
            return str(info["brand"])
    except Exception:
        pass
    return case_dir.name.rsplit("+", 1)[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-brand", type=int, default=25)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    cases = [p for p in PHISH.iterdir() if p.is_dir()]
    rng.shuffle(cases)
    picked: dict[str, int] = {}
    kept: list[pathlib.Path] = []
    for c in cases:
        b = brand_of(c)
        if not (c / "shot.png").exists() or not (c / "yolo_coords.txt").exists():
            continue
        if picked.get(b, 0) >= args.per_brand:
            continue
        picked[b] = picked.get(b, 0) + 1
        kept.append(c)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    n_files = 0
    with tarfile.open(OUT, "w") as tar:
        for bdir in sorted(LOGOS.iterdir()):
            if bdir.is_dir():
                tar.add(bdir, arcname=f"targetlist/{bdir.name}")
        for c in kept:
            for f in ("shot.png", "yolo_coords.txt", "info.txt"):
                fp = c / f
                if fp.exists():
                    tar.add(fp, arcname=f"phish/{c.name}/{f}")
                    n_files += 1
        for b in sorted(BENIGN.glob("*.*")):
            tar.add(b, arcname=f"benign/{b.name}")
        for j in (
            ROOT / "ml/brand-domains.json",
            ROOT / "ml/datasets/eval-corpus-vision.v1.json",
            ROOT / "ml/datasets/eval-corpus-vision-benign.v1.json",
        ):
            if j.exists():
                tar.add(j, arcname=f"meta/{j.name}")

    size_mb = OUT.stat().st_size / 1e6
    print(
        f"packed {OUT} ({size_mb:.0f} MB): {len(kept)} phish cases "
        f"across {len(picked)} brands, {n_files} case files + targetlist + benign"
    )
    print("upload: .venv-modal/Scripts/python -m modal volume put sovir-ml-data "
          f'"{OUT}" /visual-data.tar')
    return 0


if __name__ == "__main__":
    sys.exit(main())
