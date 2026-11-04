# SOVIR — Trabajo que requiere intervención humana

Consolidado de decisiones y acciones que un agente **no** puede tomar solo.
Cada entrada dice qué falta y qué sí está listo para ejecutar en cuanto se
apruebe. Actualizado 2026-07-25 tras el trabajo nocturno en H3/H4/H5.

## Decisiones de diseño (necesitan ADR aprobado)

| Tema | Qué falta | Qué ya está listo |
|---|---|---|
| **Niveles de protección** (observador/equilibrado/reforzado, H5) | ADR: semántica por nivel, umbral por nivel, migración de grants existentes | Tests de alcance ya fijan que ningún nivel actúa fuera del grant |
| **Sync de settings web↔móvil** (H5) | ADR: quién gana en conflicto, resolución, qué se sincroniza, minimización | Endpoint `/v1/principals/me/privacy-settings` diseñado en ticket |
| **Billing/entitlements** (H9) | ADR de contrato `BillingGateway` + aprobación de proveedor | `PAYMENTS_OPTIONS.md`: Polar recomendado, fallback Stripe |
| **Sync cifrada de eventos** (H8) | ADR cripto: qué cifra, dónde vive la clave, qué ve el servidor | SDK tipado + endpoint `intel/pull` ya existen |

## Credenciales / secretos (solo el maintainer)

| Tema | Qué falta |
|---|---|
| **Provider remoto real** (H4 — Meta Muse Spark u otro) | API key + aprobación de presupuesto. La seam `SOVIR_HTTP_EGRESS=real` + allowlist + hard cap ya existe y está testeada |
| **Cuenta Polar/Stripe** | Registro, verificación, webhook secret, producto+precio creados |
| **Store packaging** | Cuentas Chrome Web Store / Google Play, signing keys |

## Hardware / plataforma (fuera de esta estación)

| Tema | Qué falta |
|---|---|
| **iOS** | Mac + Xcode + cuenta Apple Developer |
| **Desktop** (Windows/macOS observer) | Empaquetado Tauri/nativo + permisos de captura por OS |
| **Energía real en Android** | Medición física con `batterystats`/Perfetto en el teléfono — no automatizable desde aquí |
| **Datos móviles** | Probar el stack por LTE/5G (hoy todo por WiFi/Tailscale) |

## Revisión humana obligatoria (por regla del repo)

- Merge de cualquier PR — ningún agente fusiona.
- Claims de "protección real": el modelo visual sigue `NOT READY`
  (13% FP / 3% recall en el eval); el sistema es scaffold, no antivirus.
- Permisos de plataforma nuevos (screen capture, accessibility ampliado).
- Marca/identidad visual y cualquier pantalla nueva de producto.
- Gasto de proveedor: créditos Modal ($100, competencia) y cualquier API paga.

## Lo que NO requiere intervención (bloqueos ya resueltos esta noche)

- `x-sovir-device` + `last_seen` real: hecho y verificado en vivo (móvil y ext).
- Dedup de contenido + regla de cambio material (H3): implementado, 35/14/9 tests verdes.
- Justificación de no-correlación (H4): `correlation_notes` en assessments.
- Benchmark del path in-mem (H3): números en `PERFORMANCE_BASELINE.md`, job CI `benchmark`.
- Tests formales de alcance device/source/tenant (H5): fijados en `use_cases.rs`.
