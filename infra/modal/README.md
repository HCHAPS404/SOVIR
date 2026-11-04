# infra/modal

Offline GPU batch jobs on Modal (ADR-0017). These run **outside the live
request path** — they produce model artifacts and eval reports that ship
to `ml/artifacts/` and get loaded by the local council. No user content
is ever uploaded: corpora are synthetic or public research data
(invariant 5).

## Jobs

| Script | Purpose | Output (volume `sovir-ml-out`) |
|---|---|---|
| `text_train_app.py` | 21-signal sigmoid head on MiniLM multilingual over `ml/datasets/text-corpus` | `text-v1/{model.onnx,thresholds.json,eval-report.json}` |
| `visual_train_app.py` | Siamese fine-tune of MobileNetV3-Small on Phishpedia public corpus (cures the ~22% FP of the ImageNet baseline) | `visual-v1/{visual.onnx,prototypes.json,eval-report.json}` |
| `provider_eval_app.py` | Batch eval of remote providers (Meta, Baseten) on synthetic corpus | provider eval report |
| `prep_visual_data.py` | Packs `ml/datasets/phishpedia` + `benign-brands` into `visual-data.tar` | upload input |

## Runbook

```bash
# text (T4, ~minutes)
python ml/pipelines/expand_corpus.py        # optional: expand corpus first
tar -cf ml/text-corpus.tar -C ml/datasets text-corpus
.venv-modal/Scripts/python -m modal volume put sovir-ml-data ml/text-corpus.tar //text-corpus.tar --force
.venv-modal/Scripts/python -m modal run infra/modal/text_train_app.py
.venv-modal/Scripts/python -m modal volume get sovir-ml-out /text-v1 ml/artifacts/text-v1 --force

# visual
.venv-modal/Scripts/python infra/modal/prep_visual_data.py
.venv-modal/Scripts/python -m modal volume put sovir-ml-data ml/artifacts/visual-data.tar //visual-data.tar --force
.venv-modal/Scripts/python -m modal run infra/modal/visual_train_app.py
.venv-modal/Scripts/python -m modal volume get sovir-ml-out /visual-v1 ml/artifacts/visual-v1 --force
```

API loads text artifacts via `SOVIR_ONNX_TEXT_DIR` (build the api with
`--features onnx`). Windows notes: use `//path` for remote volume paths in
MSYS bash; set `PYTHONIOENCODING=utf-8` if the modal CLI crashes on unicode
output.

Verified: text-v1 trained 2026-11-04 (micro-P 0.968 / micro-R 0.86 /
benign-FP 5.4% — see `ml/model-cards/sovir-onnx-text.md` for eval caveats).
Visual pipeline: code complete, first run pending.
