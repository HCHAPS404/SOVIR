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

# UNVERIFIED PLACEHOLDERS — obtain the real Google Drive file IDs from
# https://github.com/lindsey98/Phishpedia README ("Dataset" section) and
# paste them here before running. Do not trust IDs from memory or chat.
PHISH_GDRIVE_ID = "PASTE_FROM_PHISHPEDIA_README"
BENIGN_GDRIVE_ID = "PASTE_FROM_PHISHPEDIA_README"


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
    fetch(PHISH_GDRIVE_ID, root / "phish_sample_30k.zip")
    fetch(BENIGN_GDRIVE_ID, root / "benign_sample_30k.zip")
    print(
        "Downloaded. Next: unzip both archives here, then run "
        "ml/pipelines/build_vision_corpus.py to emit "
        "ml/datasets/eval-corpus-vision.v1.json (synthetic-downsampled, "
        "no real-user content)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
