# ADR-0020 — Clasificador de visión on-device (propuesta)

- Status: Proposed — pending maintainer signoff
- Date: 2026-10-29
- Owners: backend (Claude) + platform (Cursor)
- Related issue: edge plane v3; extends ADR-0015, ADR-0019

## Context

La capa final de detección que el DOM y el OCR no alcanzan: contenido
visual engañoso sin texto legible — fotos carnada (persona en anuncio
que vende otra cosa), logotipos bancarios falsificados, capturas de
interfaz suplantada, QR maliciosos, deepfakes en videollamada.

El caso real observado: un anuncio de Marketplace cuya foto muestra una
persona (gancho emocional) vendiendo motos "estrelladas". El texto ya es
detectable vía OCR/DOM; la foto carnada requiere comprensión de imagen.

Restricciones: invariantes 2 (local-first), 5 (inferencia remota bajo cap
+ allowlist), 7 (no perfilar vulnerabilidades), 8 (ADR + matriz antes de
SDKs/proveedores). Pago exclusivo a modelos Meta si hubiera remoto.

## Options

1. **Sin visión** — aceptar el blind spot. Coste cero; deja fuera una
   categoría real y creciente de fraude visual.
2. **Visión remota (API de proveedor)** — rechazada como ruta primaria:
   exige enviar la imagen del usuario fuera del dispositivo. Solo
   concebible para contenido ya público + `PrivacyMode::Standard` +
   presupuesto, y aun así no cubre pantalla privada.
3. **Clasificador on-device, gated** (elegida) — modelo pequeño local
   (cuantizado, embeddings o CLIP-like) sobre regiones ya flaggeadas por
   DOM/OCR/estadística. Emite etiquetas tipadas (`image_lure`,
   `brand_impersonation`, `qr_present`), nunca descripciones libres.

## Decision

1. **Taxonomía cerrada de etiquetas.** El clasificador NO genera texto
   libre: emite scores sobre un conjunto cerrado de clases de amenaza
   visual mapeadas a `RiskSignal`s tipadas (o señales nuevas con su
   propio amendment al enum + contrato, en ticket separado).
2. **Gating igual que OCR (ADR-0019).** Solo regiones con consentimiento
   y/o pre-marcadas por capas baratas. Jamás clasificación continua de
   pantalla.
3. **Modelo local primero.** La ruta default es un modelo cuantizado
   on-device (sin egress, coste monetario cero). Cualquier ruta remota
   posterior exigiría ADR propio + `BudgetReservations` + allowlist
   Meta-only + `PrivacyMode::Standard` con contenido previamente público.
4. **Salida hipotética, jamás veredicto.** Los scores del clasificador
   entran como hipótesis tipadas al `PolicyPack`; corroboración con
   señales DOM/OCR es requisito para Warn — un clasificador de imagen
   solo no dispara intervención.
5. **Sin perfil de persona.** Prohibido usar la visión para inferir
   estado emocional, identidad, edad o vulnerabilidad del usuario o de
   terceros (invariante 7). Las clases permitidas describen el
   *artefacto visual*, no a las personas.

## Privacy matrix (invariante 8)

| Elemento | Tratamiento |
|---|---|
| Región de imagen | Memoria volátil, descarte post-inferencia |
| Salida del modelo | Scores sobre taxonomía cerrada → señales tipadas; nunca caption libre (un caption podría contener PII) |
| Persistencia | Señales + `content_digest` + `Rect`, igual que hoy |
| Modelo | Local, distribuido con el binario o descarga firmada; su hash entra en release checklist |
| Egress | Cero en la ruta default |
| Fixtures | Imágenes sintéticas/generated, nunca fotos reales de personas |
| Permiso OS nuevo | Ninguno adicional a ADR-0015 |

## Cost gate

Inferencia local: coste monetario cero; el gating acota CPU/batería. Si
algún día se habilita ruta remota Meta-only: `BudgetReservations`
reserva antes de ejecutar, misma máquina ya implementada.

## Consequences

- Requiere selección de modelo, licencia, tamaño y eval — trabajo de
  ticket separado, no de este ADR.
- Nueva familia de falsos positivos (fotos legítimas con persona):
  mitigado por la regla de corroboración (punto 4).
- **No implementado hasta firma del maintainer.**
