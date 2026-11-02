# Model card — `onnx-text` (`horizon-phishing-scam-detector-base`)

**Tipo:** clasificador ONNX real (mmBERT-base, 307M, int8). Votante
`onnx-text` del concilio (ADR-0025). Adapter `OnnxTextVoter` en
`crates/sovir-adapters` — gate `feature="onnx"` + `SOVIR_ONNX_TEXT_DIR`.

**Provenance:** Hugging Face `Horizon-Labs/phishing-scam-detector-base`.
**Licencia: Apache-2.0** — libre para tomar, modificar y usar.

## Qué hace

Puntúa `request.text_hint` (texto crudo observado, LOCAL) en tres clases
(`config.json id2label`: `0=legitimate, 1=spam, 2=fraud`) y emite una
hipótesis tipada: `fraud→text_classifier_fraud`,
`spam→text_classifier_spam`, `legitimate→no_pattern_detected`.
`confidence_bp` = softmax P(clase ganadora). Sin `text_hint` se abstiene
(Err → ausente de `votes[]`).

## Privacidad (invariante crítico)

El texto **jamás egresa**: el voter corre in-process vía `ort`; el sobre
remoto se construye campo a campo sin `text_hint` — verificado por
`remote_envelope_never_carries_text_hint`. En `Private` el remoto ni se
invoca; en `Standard` el remoto ve solo señales tipadas.

## Eval publicada por el proveedor

- AUC smishing real multilingüe 0.925; por idioma: es 0.974, pt 0.971,
  en emails 0.978 (tabla del model card del proveedor).
- FPR ~0.11 @0.5 — conservador; el umbral de uso es decisión de política.
- Recall portugués bajo a 0.5 (32%) — calibrar `settle` si se usa es-419.

**Corpus SOVIR:** pendiente gate de eval propio (casos es/en sintéticos
sobre el vocabulario de señales); las métricas del proveedor son
referencia, no nuestro gate.

## Recursos

- 641MB int8 en disco + RAM del proceso; ~decenas de ms/inferencia CPU.
- Runtime `ort` 2.0.0-rc.10 + `tokenizers` — deps opcionales tras
  `feature = "onnx"` (default build no las compila).

## Limitaciones

- Un voto estadístico: puede errar en dominios fuera de su training
  (smishing/email/SMS) — el concilio registra `Disputed`, la política
  arbitra; nunca decide sola.
- Modelo fijado por commit de HF — un cambio de artifact exige re-eval.
