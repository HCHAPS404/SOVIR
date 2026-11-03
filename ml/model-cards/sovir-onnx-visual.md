# Model card — sovir-onnx-visual-v0 (measured on real pages: NOT READY)

| Field | Value |
|---|---|
| Status | **NOT READY for production signals** — gated eval on real pages shows the artifact fails BOTH ends at 0.90 (see Measured eval). Kept in-tree for iteration; treat its votes as provisional until a logo-vs-logo variant re-measures clean |
| Placement | Extension worker (edge) — pixels never egress; only `AUTHORITY_IMPERSONATION` crosses in the IMAGE_REGION event |
| Encoder | MobileNetV3-Small ImageNet-pretrained (BSD-3 torchvision weights) → 576-dim embedding, ONNX 3.7MB |
| Matching | per-image int8 banks (2,296 vectors, 241 brands) — max cosine over images, NOT centroid (centroid measured unseparable: −0.16 margin) |
| Detection rule | best match ≥ 0.90 cosine AND page host ∉ brand domains → `AUTHORITY_IMPERSONATION` |
| Measured eval (logos, n=27) | 52% self-recall, 0% cross-brand false @0.90 — the original claim, only valid on clean logo crops |
| Measured eval (2026-11-03, REAL pages) | `eval_vision_onnx.py` on 400 Phishpedia screenshots: **whole-frame recall 3.0%**; tile-simulated regions 11.7%. On 130 legit homepages (new benign corpus): **FP 13.1% @0.90, region-guided 27.7%**, 89 near-misses ≥0.83. Mean best-score is INVERTED — benign pages (0.834) outscore phishing pages (0.735): **no threshold fixes this** |
| Root cause | Logo-vs-page asymmetry: prototypes embed clean logo crops but inference embeds full-page content — the ImageNet encoder clusters by LAYOUT (white header + hero), collapsing unrelated pages onto prototypes like `crate_and_barrel` (5 distinct legit sites >0.91) |
| Data | Phishpedia `expand_targetlist` logos (CC0-1.0); gated corpora `eval-corpus-vision.v1.json` (400 phish) + `eval-corpus-vision-benign.v1.json` (130 legit, built via `build_benign_corpus.mjs`) |
| Privacy surface | in-worker, in-memory; frame discarded after scan; digest binds the analyzed frame |
| Runtime | onnxruntime-web wasm vendored at `apps/extension/ort/` (MIT), single-threaded |
| Known limits | The DOM-region pipeline (`sovirExtractLogoRegions` → `analyze(frame, host, logoFrame)`) is implemented and needed: only logo-TIGHT crops make the comparison logo-vs-logo. A v1 must (a) embed DOM img rects, not page tiles, (b) re-tune threshold on BOTH corpora, (c) re-pass benign FP ≈0 and beat the dHash floor (19% recall @ 9% FP) before its votes gate user-facing warnings |

Pipeline: `fetch_phishpedia.py` → `train_visual.py` (torch, ml/.venv) → artifacts → `apps/extension/models/` → `eval_vision_onnx.py` on both gated corpora.
