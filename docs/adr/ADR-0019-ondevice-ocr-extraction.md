# ADR-0019 — OCR on-device como modalidad de extracción (propuesta)

- Status: Proposed — pending maintainer signoff
- Date: 2026-10-29
- Owners: platform (Cursor) + backend (Claude)
- Related issue: edge plane v2; extends ADR-0014, ADR-0015

## Context

ADR-0015 fijó el pipeline `frame → señales tipadas → descarte` y entregó
`sovir-edge-extract` con heurísticas estructurales (regiones rojo-alarma,
overlays modales). Su propio contrato declara el límite: *"no OCR, no
text, no recognition of real screen content; those require a new ADR"*.

El caso real que lo motiva: estafas renderizadas como imagen — memes de
"inversión", capturas de WhatsApp reenviadas, anuncios de Marketplace
donde el texto fraudulento está incrustado en la foto. El extractor DOM
no ve nada de eso; la estadística de píxeles ve forma pero no contenido.

La tabla `TERMS` multilingüe del extractor (8 idiomas, data-driven) ya
existe y es el consumidor natural: el texto reconocido en píxeles entra
al mismo pipeline de señales tipadas que el texto del DOM.

## Options

1. **OCR remoto** — enviar regiones a un servicio de OCR. Rechazada:
   viola local-first y la frontera de egress; las regiones contienen
   exactamente el contenido sensible que el sistema promete no sacar.
2. **OCR on-device, gated** (elegida) — motor OCR local (p. ej. wasm o
   nativo por plataforma) ejecutado SOLO sobre regiones ya marcadas por
   capas baratas: regiones `ImageRegion` observadas con consentimiento,
   o zonas que la estadística estructural marcó como sospechosas.
3. **OCR continuo de toda la pantalla** — rechazada: coste energético
   inaceptable y convierte al observer en keylogger de facto.

## Decision

1. **Gating obligatorio por cascada.** OCR nunca corre sobre pantalla
   completa ni de forma continua. Disparadores válidos:
   - la región pertenece a una página/sitio con observación opt-in
     activa (mismo grant que hoy autoriza el DOM), o
   - el análisis estructural previo (ADR-0015) emitió señal sobre esa
     región (overlay modal, rojo-alarma).
2. **Salida = texto en memoria → `TERMS` → señales.** El texto OCR se
   evalúa contra la misma tabla multilingüe del extractor DOM y se
   descarta. Persisten únicamente `ExtractedSignal`s tipadas y el
   `content_digest` de la región — nunca el texto reconocido.
3. **Digest de la región, no del frame.** El `content_digest` se calcula
   sobre la región extraída con su `Rect`, manteniendo la semántica del
   contrato existente sin persistir imagen.
4. **Modality del contrato.** Los eventos emiten `Modality::ImageRegion`
   (ya existe) con las mismas `SensitiveDataClass` y consentimiento del
   source `screen-observer:<platform>`. No se añaden campos al contrato.
5. **Señal nueva opcional.** Si el OCR no puede ejecutarse (motor no
   disponible, frame corrupto), el adaptador emite `IDENTITY_UNVERIFIED`-
   style fail-closed local: simplemente no emite texto, jamás inventa.

## Privacy matrix (invariante 8)

| Elemento | Tratamiento |
|---|---|
| Píxeles / frame | Memoria volátil, descarte en la misma llamada; jamás disco/log/egress |
| Texto OCR | Memoria volátil → tabla `TERMS` → descarte; jamás persistido |
| Persistencia | Solo señales tipadas + `content_digest` + `Rect` |
| Consentimiento | Mismo grant opt-in por sitio/fuente (ADR-0014); sin grant no hay OCR |
| Egress | Cero — el motor OCR corre 100% on-device |
| Fixtures de prueba | Imágenes sintéticas generadas (texto renderizado programáticamente); nunca capturas reales |
| Permiso OS nuevo | Ninguno adicional al de captura de ADR-0015 |

## Cost gate

OCR es CPU local — coste monetario cero, coste energético real. El gating
por cascada lo acota; un presupuesto de ejecuciones/segundo por pestaña se
fija en el adaptador (p. ej. máx. 1 OCR/sitio observado cada N s).

## Consequences

- La superficie de amenaza de "texto legible por máquina" se amplía a
  imágenes y capturas incrustadas.
- Dependencia nueva: un motor OCR (wasm/nativo) — requiere revisión de
  licencia y tamaño de bundle antes de implementar.
- Riesgo de lectura errónea (OCR ≠ verdad): las señales OCR entran como
  hipótesis al mismo policy pack; nunca autorizan por sí solas.
- **No implementado hasta firma del maintainer.**

## Non-goals

- No continuous screen OCR, no full-screen text indexing.
- No OCR output persisted or exported — signals only.
- No keyboard/typing reconstruction from pixels (keylogger ban).

## Acceptance criteria

- Given a synthetic fixture image containing a known phishing phrase in
  each supported language, extraction emits the same `RiskSignal`s the
  DOM extractor would for that text.
- With no active grant for the source, the adapter emits nothing.
- OCR runs at most on gated regions; a counter exposes executions per
  site/session for budget review.

## Test obligations

- All fixtures generated programmatically (no real screenshots/PII).
- Negative: benign text in image emits no signals.
- Fail-closed: OCR engine unavailable → adapter emits nothing, never
  guesses text.

## Reversion

- `SOVIR_EDGE_OCR=0` disables the adapter; the DOM/DOM+structural path
  is unaffected.
