# B20 — Propuesta: APIs de servidor, SDKs de servicio y webhooks

**Estado:** PROPUESTA. Devin posee integraciones de servidor: webhooks salientes firmados, autenticación de integraciones, contratos de API pública y cliente tipado. Nada implementado.

## Piezas

### 1. Webhooks salientes (consumen la cola de B15)

- Endpoint suscrito por el cliente empresarial/desarrollador: `POST {subscriber_url}` con eventos `intervention.delivered`, `consent.revoked`, `device.revoked`, `export.ready`.
- Firma: `X-Sovir-Signature: t=<unix_ts>,v1=<hmac_sha256(ts + "." + body, webhook_secret)>` — estándar (patrón Stripe), verificable sin SDK.
- `webhook_secret` por suscripción, rotatable, almacenado hasheado; nunca en logs.
- Entrega: at-least-once con `delivery_id` idempotente; el receptor debe deduplicar.
- Reintentos: misma política de B15 (backoff, máx 5, DLQ auditada).

### 2. Registro de suscripciones

`POST /v1/webhooks` (admin del tenant): `{url, events[], description}` → validación de ownership con ping firmado antes de activar. `GET`, `DELETE`, `POST /v1/webhooks/{id}/rotate-secret`.

Restricciones: solo URLs HTTPS, sin IPs privadas/loopback (SSRF guard), dominio verificado por challenge.

### 3. API pública y contratos

- Versión: `v1` estable en `packages/contracts/openapi/` (la dev API actual queda como `backend-dev.v0`, separada explícitamente).
- Compatibilidad: `contract_check.py` ya compara schemas; añadir difusión de compatibilidad OpenAPI entre versiones cuando exista `v1` (breaking-change gate).
- `packages/client-sdk/`: cliente tipado generado desde OpenAPI (Rust + TS) — generación como job CI cuando `v1` se congele.

### 4. Auth de integraciones

- API keys por tenant con scopes (`webhooks:admin`, `events:read`), prefijo identificable `svk_live_`/`svk_test_`, hasheadas en tabla (nunca en claro), rotación y último uso registrado.
- Separadas de sesiones de usuario (B8): una API key no actúa como usuario y viceversa.

## Tests de aceptación

1. Firma inválida → receptor puede rechazar (verificación documentada + test vector).
2. Suscripción a `http://` o `127.0.0.1` → 400 (SSRF).
3. Webhook a endpoint caído → reintentos + DLQ, sin bloquear cola.
4. `delivery_id` duplicado → receptor deduplica (documentado).
5. API key revocada → 401 inmediato.
6. Rotación de secreto → firma nueva válida, la antigua deja de firmar.
7. OpenAPI v1 vs fixture → contrato servido igual que el documento.

## Dependencias

- B15 (cola de entregas), B16 (retención del log de entregas), B19 (tenants para API keys empresariales).
- Abierto maintainer: ¿dominio base para webhooks y límites de suscriptores?
