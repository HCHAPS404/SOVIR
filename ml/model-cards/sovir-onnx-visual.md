# Model card — sovir-onnx-visual (CANDIDATE, not approved)

| Field | Value |
|---|---|
| Status | **NOT_APPROVED** — artifact absent; `sovirVisionOnnx.analyze()` abstains (`no_artifact`) by construction |
| Placement | **Extension worker (edge)** — pixels never egress, so a server-side `OnnxVisualVoter` cannot receive visual input; the voter lives where the pixels are. Only the emitted enum (`AUTHORITY_IMPERSONATION`) crosses to the API inside the normal IMAGE_REGION event |
| Candidate | MobileNetV3-Small (ImageNet-pretrained, BSD-3) as embedding encoder + per-brand prototype vectors — Phishpedia's logo-matching direction without porting detectron2+Siamese |
| Detection rule | frame ≈ brand prototype AND page host ∉ brand's curated domains → `AUTHORITY_IMPERSONATION`. No classifier head, no phishing labels in weights |
| Data | Phishpedia targetlist logos (CC0-1.0) for prototypes; the 30k benchmark is eval-only |
| Privacy surface | in-worker, in-memory; frame discarded after scan; digest binds the analyzed frame |
| Gate to activate | artifact produced by `ml/pipelines/train_visual.py` → eval-corpus-vision.v1.json populated → gated eval ≥ threshold → license/provenance verified → human signoff (AGENTS.md inv. 8) → files copied into `apps/extension/models/` |
| Known limits | brand coverage limited to the curated targetlist; embedding similarity is not logo-understanding; threshold must be calibrated on the eval corpus before shipping |

Pipeline: `fetch_phishpedia.py` → `train_visual.py` → eval corpus → signoff → `apps/extension/models/{visual.onnx,prototypes.json}`.
