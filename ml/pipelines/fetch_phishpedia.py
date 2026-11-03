#!/usr/bin/env python3
"""Fetch the Phishpedia dataset (CC0-1.0) for the onnx-visual voter.

ADR-0024 gate: no model ships until this dataset produces an eval corpus
+ a licensed, provenance-verified artifact. Nothing here runs in CI —
the dataset is ~GBs and lives on Google Drive.

Usage:
    python ml/pipelines/fetch_phishpedia.py --out ml/datasets/phishpedia

Requires: pip install gdown
Source: https://github.com/lindsey98/Phishpedia (CC0-1.0)
Dataset contents (~30k phishing + ~30k benign): screenshots, HTML,
per-site target brand — exactly the label space OnnxVisualVoter needs.
"""
import argparse
import pathlib
import subprocess
import sys

# Verified 2026-11-03 against the official README (line 27): the project
# publishes ONE Drive file — the 30k phishing benchmark (URL + HTML +
# screenshot + target brand per site). There is no separate benign zip;
# benign contrast sites come from our own corpus list, not this archive.
DATASET_GDRIVE_ID = "12ypEMPRQ43zGRqHGut0Esq2z5en0DH4g"


def fetch(file_id: str, out: pathlib.Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, "-m", "gdown", "--id", file_id, "-O", str(out)],
        check=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="ml/datasets/phishpedia")
    args = ap.parse_args()
    root = pathlib.Path(args.out)
    fetch(DATASET_GDRIVE_ID, root / "phishpedia_30k.zip")
    print(
        "Downloaded. Next: unzip the archive here, then run "
        "ml/pipelines/train_visual.py to build brand prototypes and emit "
        "ml/datasets/eval-corpus-vision.v1.json for the gated eval."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
