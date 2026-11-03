#!/usr/bin/env python3
"""Scaffold: fine-tune the text voter for the local council (B4/B13).

NOT_IMPLEMENTED yet — requires `torch` + `transformers` (deferred toolchain,
see docs/operations/DEFERRED_TOOLCHAINS.md). This script defines the intended
pipeline so the eval surface is ready when the toolchain lands.

Design (mirrors the visual pipeline, ADR-0024):
  * Input: ml/datasets/text-corpus/ (labeled JSONL: {"text", "signals": [...]})
           — synthetic/fixture text only; never real user content (invariant 2).
  * Base : multilingual MiniLM / DistilBERT ONNX encoder (already evaluated
           in eval_text_onnx.py as a zero-shot baseline).
  * Head : multi-label linear head over the 26-signal taxonomy
           (packages/contracts/openapi/backend-dev.v0.yaml → signals enum).
  * Output: ml/artifacts/onnx-text/model.onnx + thresholds.json calibrated
            per-signal on a held-out benign split (target: <1% benign FP
            before any ship decision).

Usage (when toolchain lands):
  python ml/pipelines/train_text_classifier.py \
      --corpus ml/datasets/text-corpus \
      --out ml/artifacts/onnx-text/ \
      --epochs 4 --base sentence-transformers/all-MiniLM-L12-v2
"""
from __future__ import annotations

import argparse
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--base", default="sentence-transformers/all-MiniLM-L12-v2")
    ap.parse_args()
    print(
        "NOT_IMPLEMENTED: torch/transformers deferred (DEFERRED_TOOLCHAINS.md).\n"
        "This scaffold documents the intended pipeline and eval gate:\n"
        "  multi-label head over the 26-signal taxonomy, per-signal thresholds\n"
        "  calibrated to <1% benign FP on held-out benign text.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
