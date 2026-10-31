# ADR-0015 — Pixel capture y extracción on-device (propuesta)

- Status: Proposed — pending maintainer signoff
- Date: 2026-05-20
- Owners: platform (Cursor) + backend (Claude)
- Related issue: edge plane; supersedes nothing, extends ADR-0014

## Context

ADR-0014 fijó el modelo de consentimiento del observer y dejó la captura de
píxeles como `NOT_IMPLEMENTED`: "needs on-device extraction before pixels
may emit". El contrato ya existe — `Modality::ImageRegion`,
`SensitiveDataClass`, `content_digest` y `signals` tipadas — así que el
trabajo pendiente es definir **cómo** un frame llega a ser una señal sin
que el contenido visual abandone jamás el dispositivo.

Restricciones vigentes (invariantes 1, 2, 8): la captura requiere el
permiso del OS (Windows.Graphics.Capture abre diálogo del sistema);
nada de píxeles en disco, logs, telemetría ni egress; todo fixture de
prueba es sintético, nunca capturas reales ni PII.

## Options

1. **No capturar** — el observer actual (metadata de ventana + señales de
   proceso) ya cubre parte del modelo de amenazas. Coste cero, pero no
   detecta dark patterns ni señales visuales que un título no expone.
2. **Captura + forward** — enviar frames/regiones al backend para
   análisis. Rechazada: viola la frontera local-first y la clase `Secret`;
   el contrato de evento no admite payloads por diseño.
3. **Captura + extracción on-device** (elegida) — un pipeline de dos
   piezas: (a) un crate puro `sovir-edge-extract` imagen→señales, sin I/O
   ni OS, testeable con fixtures sintéticos; (b) un adaptador de captura
   por plataforma que alimenta el extractor y descarta el frame.

## Decision

1. **Pipeline estricto frame → señal → descarte.** El adaptador de
   captura (Windows.Graphics.Capture en `services/observer`) entrega un
   frame en memoria a `sovir-edge-extract`; recibe `ExtractedSignal`s
   tipadas; libera el frame en la misma llamada. El frame nunca:
   - se escribe a disco ni a ningún store (incluido `sovir-edge-store`),
   - entra en logs/tracing (ni siquiera su tamaño o hash, a menos que el
     digest ya exista como `content_digest` del evento),
   - cruza una frontera de proceso o red.
2. **`sovir-edge-extract` es dominio puro.** Sin deps de OS, red, fs ni
   async: entrada `PixelFrame { width, height, rgba }` +
   `regions: Vec<Rect>`, salida `Vec<ExtractedSignal>` con
   `risk_signals` (subconjunto de `RiskSignal` del dominio), `digest`
   (hash de la región, metadato) y confianza acotada. Cualquier regla que
   requiera OCR real queda NOT_IMPLEMENTED — v1 usa heurísticas de forma/
   estructura sobre fixtures sintéticos, declarado honestamente.
3. **Consentimiento por ventana.** El adaptador solo captura cuando el
   proceso de la ventana activa tiene grant vigente cuyo `source_id`
   cubre `screen-observer:windows` — el mismo binding que el observer de
   metadata; una ventana sin grant no se captura nunca.
4. **Fallback fail-closed.** Si el extractor panic-a o el adaptador de
   captura falla, el observer emite **cero** eventos de imagen — nunca un
   veredicto inventado ni un frame "por si acaso".
5. **Escala de clases.** Eventos derivados de imagen se emiten como
   `IMAGE_REGION` con `sensitive_data_class` calculada por contexto de
   proceso (misma lógica que `classify` actual); la clase `Secret` sigue
   estructuralmente imposible de emitir desde el edge.

## Consequences

- El crate puro se puede construir y evaluar hoy (E2) sin tocar APIs de
  captura: fixtures sintéticos generados procedimentalmente.
- La captura real (Windows.Graphics.Capture, ScreenCaptureKit, PipeWire)
  queda como siguiente fase — cada adaptador requiere su ticket +
  `platform-permission-review` (invariante 8).
- Riesgo residual: las heurísticas de imagen producen falsos positivos
  sobre estructuras ambiguas; se acepta porque las señales son hipótesis
  (la política decide), nunca hechos.
- Coste: CPU local por frame; el extractor acota trabajo por frame
  (presupuesto de regiones/píxeles documentado en el crate).

## Verification

- Tests del crate: fixtures sintéticos deterministas (gradientes,
  rejillas, patrones tipo "diálogo de urgencia" dibujados por código) →
  señales esperadas; nunca imágenes de archivo ni capturas reales.
- Property: para cualquier frame de entrada, la salida contiene solo
  señales tipadas + digest — sin bytes de imagen en la estructura de
  salida (assert sobre tamaño de salida y campos).
- `cargo test -p sovir-edge-extract` en CI; la captura real queda
  `NOT_IMPLEMENTED` hasta su ticket propio.

## Review date and rollback

Revisar cuando se apruebe el adaptador Windows.Graphics.Capture o se
introduzca OCR real (nuevo ADR). Rollback: el crate es opt-in — el
observer corre sin él por defecto.
