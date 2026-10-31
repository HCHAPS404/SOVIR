# B7 — Facturación y pagos (propuesta)

Estado: **BLOQUEADO — decisión del maintainer**. Nada de pagos se
implementa sin aprobación humana; esto delimita el diseño.

## Principios (fijados por las reglas del repo)

- Cero datos de pago propios: se usa un procesador externo (Stripe u
  equivalente); SOVIR nunca almacena PAN/CVV.
- La facturación no puede leer contenido de usuario: solo metadatos de
  uso ya agregados (BudgetLedger), nunca eventos.
- Un usuario free/local-first funciona sin backend de pagos — los pagos
  desbloquean límites, no la protección básica.

## Alcance propuesto

1. **Entitlements por tenant**
   - Tabla `entitlements(tenant_id, plan, limits_jsonb, valid_until)`.
   - Límites: `max_usd_per_day`, `max_events_per_day`, webhooks
     permitidos, retención máxima.
   - Enforcement en `SovirService` antes de operaciones con coste
     (egress real, retención extendida, webhooks > N).

2. **Integración de pagos**
   - Webhook entrante del procesador (`POST /v1/billing/webhook`) con
     verificación de firma — separado del egress de intervenciones.
   - Estado `past_due`/`canceled` → downgrade a free, nunca borrado de
     datos (B16 sigue aplicando).
   - Portal de cliente gestionado por el procesador (no UI propia de
     pagos en este repo).

3. **BudgetLedger real**
   - Persistir `request_id, tenant, principal, provider, model, tokens,
     costo_estimado, costo_real, timestamp` cuando exista inferencia
     remota — hoy `SOVIR_MAX_USD_*` ya está en 0 y eso se mantiene por
     defecto.

## Decisiones que necesita el maintainer

- Procesador (Stripe vs Paddle vs otro) y jurisdicción fiscal.
- Planes y precios — producto, no ingeniería.
- Si entitlements aplica a self-hosted (probablemente no: licencia
  distinta de la nube).

## Lo que NO se hará sin esas decisiones

Ningún cargo, webhook de pago ni tabla de billing se crea antes de la
aprobación. Especialmente: ningún `cargo add stripe` ni secretos de
procesador en el repo.
