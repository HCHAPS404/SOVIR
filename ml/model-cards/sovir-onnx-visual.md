# Model card — sovir-onnx-visual-v0 (measured on real pages: NOT READY)

| Field | Value |
|---|---|
| Status | **NOT READY for production signals** — gated eval on real pages shows the artifact fails BOTH ends at 0.90 (see Measured eval). Kept in-tree for iteration; treat its votes as provisional until a logo-vs-logo variant re-measures clean |
| Placement | Extension worker (edge) — pixels never egress; only `AUTHORITY_IMPERSONATION` crosses in the IMAGE_REGION event |
| Encoder | MobileNetV3-Small ImageNet-pretrained (BSD-3 torchvision weights) → 576-dim embedding, ONNX 3.7MB |
| Matching | per-image int8 banks (2,296 vectors, 241 brands) — max cosine over images, NOT centroid (centroid measured unseparable: −0.16 margin) |
| Detection rule | best match ≥ 0.90 cosine AND page host ∉ brand domains → `AUTHORITY_IMPERSONATION` |
| Measured eval (logos, n=27) | 52% self-recall, 0% cross-brand false @0.90 — the original claim, only valid on clean logo crops |
| Measured eval (2026-11-03, REAL pages) | `eval_vision_onnx.py` on 400 Phishpedia screenshots: **whole-frame recall 3.0%**; tile-simulated regions 11.7%. On 130 legit homepages (new benign corpus): **FP 13.1% @0.90, region-guided 27.7%**, 89 near-misses ≥0.83. Mean best-score is INVERTED — benign pages (0.834) outscore phishing pages (0.735) |
| DOM-region value (2026-11-03, synthetic) | `eval_logo_crop_value.py` — 148 logos composited on phishing-style pages: tight DOM-rect crop fires 49% vs whole-frame 8%, with **97% correct-brand precision among fires**. The implemented DOM pipeline (`sovirExtractLogoRegions` → `analyze(frame, host, logoFrame)`) is the right query-side fix |
| Threshold curve (logo-vs-logo, 241 brands, 1392 logos) | `eval_threshold_sweep.py` LOBO cross-FP: **0.90 → 12.6% FP / 36.9% recall; 0.92 → 6.0% / 26.9%; 0.95 → 0.6% / 14.0%**. The "0% cross-false" claim was a 27-logo artifact — the encoder cannot cleanly separate brands even logo-vs-logo |
| Bank augmentation (2026-11-03, REFUTED) | `eval_aug_bank.py` — augmented the BANK side with page-context variants (pad/border/blur/scale over page tiles), 3,808 forwards: @0.90 recall 2.3%→3.3% but benign FP **0%→11.5%** and LOBO cross 9.7%→10.7%. Page-context prototypes match *every* page better — selectivity collapses. Dead end; confirms the fix must be query-side logo-tight crops + encoder retrain, not bank tricks |
| Root cause | (a) Logo-vs-page asymmetry — fixed by DOM-tight crops (implemented, value measured). (b) Encoder capacity — ImageNet MobileNetV3 clusters by layout not brand identity; needs contrastive fine-tune on brand pairs (positives = same-brand variants, negatives = other brands + benign page headers) before any threshold makes this voter trustworthy |
| Data | Phishpedia `expand_targetlist` logos (CC0-1.0); gated corpora `eval-corpus-vision.v1.json` (400 phish) + `eval-corpus-vision-benign.v1.json` (130 legit, built via `build_benign_corpus.mjs`) |
| Privacy surface | in-worker, in-memory; frame discarded after scan; digest binds the analyzed frame |
| Runtime | onnxruntime-web wasm vendored at `apps/extension/ort/` (MIT), single-threaded |
| Known limits | The DOM-region pipeline (`sovirExtractLogoRegions` → `analyze(frame, host, logoFrame)`) is implemented and needed: only logo-TIGHT crops make the comparison logo-vs-logo. A v1 must (a) embed DOM img rects, not page tiles, (b) re-tune threshold on BOTH corpora, (c) re-pass benign FP ≈0 and beat the dHash floor (19% recall @ 9% FP) before its votes gate user-facing warnings |

Pipeline: `fetch_phishpedia.py` → `train_visual.py` (torch, ml/.venv) → artifacts → `apps/extension/models/` → `eval_vision_onnx.py` on both gated corpora.
