# Model card — sovir-onnx-visual (CANDIDATE, not approved)

| Field | Value |
|---|---|
| Status | **NOT_APPROVED** — artifact absent; `OnnxVisualVoter.serves()` returns false by construction |
| Candidate | MobileNetV3-Small fine-tuned on Phishpedia, exported int8 ONNX (~10MB) |
| Alternative | Phishpedia full pipeline (detectron2 + Siamese ResNetV2) — heavier port, USENIX'21 SOTA |
| Data | Phishpedia dataset — **CC0-1.0** (public domain), ~30k phish + ~30k benign screenshots |
| Task | page-screenshot → phish/benign (+ brand target in the full pipeline) |
| Privacy surface | local-only, in-process; pixels never egress — same as onnx-text |
| Gate to activate | eval-corpus-vision.v1.json populated + eval ≥ threshold + license/provenance verified + human signoff (AGENTS.md inv. 8) |
| Known limits | screenshot classifiers degrade on distribution shift; brand-impersonation coverage limited to seen brands |

Pipeline: `ml/pipelines/fetch_phishpedia.py` → `train_visual.py` → `build_vision_corpus.py` → cargo eval test → signoff → registry.json.
