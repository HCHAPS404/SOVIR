# B10 — Propuesta: adaptador HTTP de ingesta de eventos

**Estado:** PROPUESTA. Devin construye recepción HTTP, validación, rate limiting, idempotencia y almacenamiento. Claude posee normalización y decisión. Nada implementado.

## Endpoint actual → propuesto

| | Actual (`/v1/events`) | Propuesto |
|---|---|---|
| Auth | bearer dev único | principal+device autenticados (B8/B9) |
| Dedup | `event_id` en memoria | `Idempotency-Key` header + `(device_id, event_id)` durable |
| Rate limit | ninguno | por principal+device+IP |
| Batch | no | `POST /v1/events/batch` (máx 50, atomicidad por evento) |
| Errores | `{"message": "..."}` | sobre de error estándar (abajo) |

## Sobre de error estándar (todos los endpoints v1)

```json
{ "error": { "code": "consent_required", "request_id": "...", "retryable": false } }
```

Códigos: `unauthorized`, `forbidden`, `consent_required`, `invalid_request`, `duplicate`, `rate_limited`, `payload_too_large`, `internal`. `request_id` = el `x-request-id` ya emitido en B21-C.

## Idempotencia y anti-replay

- Header `Idempotency-Key: <uuid>` obligatorio en POSTs mutantes; la respuesta se cachea 24 h por clave+principal y se reenvía idéntica en reintentos.
- `observed_at_ms` fuera de una ventana razonable (±24 h) → `invalid_request` salvo batch histórico marcado.
- Mismo `Idempotency-Key` con body distinto → 409 `idempotency_conflict`.

## Rate limiting (adaptador, no dominio)

- Por defecto dev: 60 req/min por principal, 600/min por device, ráfaga 10. Algoritmo token-bucket en memoria ahora; store durable compartido después.
- 429 con `Retry-After` header.

## Validación de entrada

- JSON Schema `observed-event.schema.json` como fuente de verdad (ya validado en CI); el adaptador lo aplica en runtime además de serde.
- Tamaño de evento: máx 64 KB body total (ya en middleware).

## Persistencia (coordinado con B16)

`observation_events` ya existe en la migración propuesta; añadir `ingestion_idempotency(principal_id, key, response_body, created_at, expires_at)` en una migración posterior cuando haya store durable.

## Tests de aceptación

1. Reintento con misma `Idempotency-Key` → misma respuesta, una sola escritura.
2. `Idempotency-Key` repetida con body distinto → 409.
3. Flood > límite → 429 + `Retry-After`.
4. Evento con `observed_at_ms` futuro lejano → 400.
5. Evento de dispositivo revocado → 403.
6. Error siempre trae `error.code` + `request_id` consistente con el header.
7. Batch: 1 evento inválido no impide los válidos; reporta por-item.

## Dependencias

- B8 principal, B9 devices — bloquean implementación completa; el rate limit + error envelope + body limit ya son implementables ahora.
- `x-request-id` ya existe (B21-C) — reusar para `error.request_id`.
