#!/usr/bin/env python3
"""Train the onnx-visual council voter on Phishpedia (CC0-1.0).

Candidate: MobileNetV3-Small fine-tune → int8 ONNX (~10MB, ~15ms CPU).
Why this over porting Phishpedia's detectron2+Siamese pipeline: the full
pipeline is GBs of torch deps and Linux-first; a fine-tuned CNN exports
to ONNX trivially and fits the SOVIR edge budget.

Prereqs (NOT in repo deps — dev machine only):
    pip install torch torchvision onnx onnxruntime

Pipeline:
  1. python ml/pipelines/fetch_phishpedia.py   (dataset, ~GBs, gdown)
  2. unzip both archives into ml/datasets/phishpedia/
  3. python ml/pipelines/train_visual.py --data ml/datasets/phishpedia \
        --out ml/artifacts/onnx-visual/
  4. python ml/pipelines/build_vision_corpus.py   (eval split → JSON)
  5. cargo test -p sovir-adapters --features onnx onnx_visual_eval
  6. Human signoff → model card → registry.json → serves() flips true.

STATUS: NOT_RUN — dataset download + training is a dev-machine job,
blocked on GPU/time budget approval per AGENTS.md invariant 8.
"""
import argparse
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="ml/artifacts/onnx-visual")
    ap.parse_args()
    print(__doc__)
    print(
        "NOT_IMPLEMENTED: training script scaffold only — the Phishpedia "
        "dataset and a torch toolchain are required first. The ADR-0024 "
        "gate (eval corpus + license + provenance) must pass before "
        "OnnxVisualVoter.serves() may return true."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
