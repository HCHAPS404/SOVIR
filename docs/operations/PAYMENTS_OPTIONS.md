# SOVIR — Pasarela de pagos: opciones y recomendación (H9)

Requisito del maintainer: empezar **gratis**, sin costos iniciales, suficiente
para la hackathon y la primera monetización real. Estado: análisis listo;
la implementación requiere ADR de contrato (ver `REQUIRES_HUMAN.md`).

## Comparativa (verificada 2026-07)

| Opción | Costo fijo | Por transacción | Merchant of Record | Sandbox | Encaje SOVIR |
|---|---|---|---|---|---|
| **Polar** | Gratis | 5% + $0.50 | Si (gestiona IVA/impuestos globales) | Si | Mejor: open-source, dev-first, metering de uso |
| **Stripe** | Gratis | 2.9% + $0.30 (US) | No (eres responsable de impuestos) | Test mode completo | Buena: estándar, mejor docs; más carga fiscal |
| **Paddle** | Gratis | 5% + $0.50 | Si | Si | Aprobación lenta — mala para hackathon |
| **Lemon Squeezy** | Gratis | 5% + $0.50 | Si | Si | En absorción por Stripe — riesgo de migración |
| **Dodo / Creem** | Gratis | ~4% + $0.40 | Si | Si | Alternativas válidas, menos maduros |

## Recomendación

**Polar** como pasarela primaria:

- **$0 para empezar**: plan Starter sin mensualidad; solo se paga al vender.
- **Merchant of Record**: gestiona IVA/VAT e impuestos globales — un maintainer
  solo no puede darse compliance fiscal internacional.
- **Open source + dev-first**: alineado con la postura local-first/privacy del
  producto; API limpia, webhooks, sandbox real.
- **Usage metering nativo**: encaja con el modelo "niveles de protección" si
  luego se cobra por volumen de observaciones o dispositivos.

**Stripe** como fallback si Polar no aprueba la cuenta a tiempo: test mode
gratis e inmediato, pero deja la carga fiscal sobre ti (o requiere Stripe Tax
+0.5% y, para MoR real, Stripe Managed Payments — invite-only).

## Lo que se implementaría (tras aprobación)

1. ~~`sovir-ports`: trait `BillingGateway`~~ — **hecho** (scaffold commit).
2. ~~`sovir-adapters`: `PolarBillingGateway` + `NoopBillingGateway`~~ —
   **hecho**: verify Standard Webhooks (HMAC-SHA256 `whsec_`, firma
   `v1,<b64>`) + hosted-checkout link con `customer_external_id`; Noop
   fail-closed; 3 tests, cero red.
3. `services/api`: `POST /v1/billing/checkout`, `POST /v1/billing/webhook`
   (verificación de firma), plan en `whoami`/entitlements — **pendiente ADR
   de rutas**; el adapter ya está listo para cablear.
4. Console: página de plan; extension/Android: lectura de entitlement, sin
   gating de funciones en scaffold.

Nada de esto toca consent, ingest ni el council. Sin claves reales:
`SOVIR_BILLING=disabled` por defecto, fail closed.
