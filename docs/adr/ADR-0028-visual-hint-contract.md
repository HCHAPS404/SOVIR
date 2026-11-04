# ADR-0028 — Contrato `visual_hint`: crop de logo local para el votante visual del concilio

Estado: propuesto (pendiente signoff del maintainer)
Fecha: 2026-11-05

## Contexto

El votante `onnx-visual` del concilio (ADR-0025) lleva registrado desde
ADR-0024 pero era un stub deliberado que se abstenía siempre:
`InferenceRequest` no tenía payload visual — las señales tipadas no
llevan píxeles. Mientras tanto se entrenó el artifact real
(`infra/modal/visual_train_app.py` → `ml/artifacts/visual-v1/`):
encoder MobileNetV3-Small siamés (576-d, ONNX 3.7MB) + bancos de
prototipos int8 de 267 marcas, evaluado a 15.0% recall phish @0.92 con
0.77% FP benigno (ver `ml/model-cards/sovir-onnx-visual.md`).

El cliente (extensión) ya recorta regiones candidatas a logo vía rects
del DOM. Falta el contrato que lleve ese crop al votante local sin
romper el invariante: **píxeles nunca salen del dispositivo ni llegan a
un proveedor remoto**.

## Decisión

`InferenceRequest` gana un campo aditivo:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub visual_hint: Option<String>,
```

- **Contenido**: PNG de un crop de logo candidato codificado en base64,
  acotado a ~256KB decodificados (el votante rehusa —abstains— payloads
  mayores; el cuello de botella real es el preprocess 224×224, no la
  red).
- **LOCAL-ONLY, igual que `text_hint` (ADR-0025)**: el gateway remoto
  construye su sobre cable a cable campo por campo — `visual_hint` no
  existe en ese envelope y `skip_serializing_if` lo excluye de
  cualquier serialización incidental. Un votante remoto jamás recibe
  píxeles. El test `remote_envelope_never_carries_text_hint` se
  extiende con un assert simétrico sobre `visual_hint`.
- **Ausente ⇒ abstención honesta**: sin crop el votante devuelve
  `Err(Unavailable)`, no un `image_lure` adivinado.
- **Config del votante**: `SOVIR_ONNX_VISUAL_DIR` apunta al dir con
  `visual.onnx` + `prototypes.json` (misma convención DIR que
  `SOVIR_ONNX_TEXT_DIR`). Retrocompat: `SOVIR_ONNX_VISION_MODEL`
  apuntando a un `.onnx` toma su directorio padre.
- **Hipótesis emitida**: `brand_logo_impersonation` cuando el mejor
  coseno ≥ `threshold_bp/10000` del artifact (0.92 ship). Label
  deliberadamente distinto de `DOM_BRAND_MISMATCH`: son detectores de
  modalidades distintas (pixel vs DOM) — compartir string fabricaría
  acuerdo espurio en el árbitro del concilio. `DomBrandMismatch` (la
  señal tipada) sigue siendo el hermano textual; la fusión
  host-ajeno-al-dominio-de-la-marca la decide la política, no el
  votante — el votante solo afirma "este crop ES el logo de la marca X".
- **Cache del concilio**: `CachingInferenceGateway::key` ahora hashea
  también `visual_hint` — dos crops distintos no pueden compartir
  veredicto cacheado.

## Consecuencias

- Positivo: el votante visual vota de verdad en Private y Standard —
  corroboración de modalidad distinta a texto/DOM, costo $0, latencia
  CPU acotada por `SOVIR_COUNCIL_VOTER_TIMEOUT_MS`.
- Costo: +1 dependencia opcional `image` (PNG decode + resize) bajo el
  feature `onnx` — apagada el árbol compila idéntico.
- Riesgo honesto: 15% recall ≠ detector completo — solo atrapa logos
  nítidos; el 4.4% FP en tiles de fondo y 0.77% en benignos acota el
  daño pero la corroboración del concilio sigue siendo la puerta. La
  calidad del crop es responsabilidad del extractor (DOM-tight, como
  midió `eval_logo_crop_value.py`).

## Verificación

- `cargo build -p sovir-api --features onnx` y
  `cargo test -p sovir-adapters` verdes; clippy sin warnings.
- Assert de sobre remoto: ni `text_hint` ni `visual_hint` ni su
  contenido llegan al wire (`remote_envelope_never_carries_*`).
- Tests: abstención sin hint, sin artifact y con payload inválido;
  smoke con PNG sintético cuando el artifact esté instalado
  (skip limpio sin `SOVIR_ONNX_VISUAL_DIR`, mismo patrón que
  `onnx_text_voter_eval_corpus`).
