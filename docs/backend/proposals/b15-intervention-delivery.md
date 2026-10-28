# B15 — Propuesta: entrega de intervenciones autorizadas

**Estado:** PROPUESTA. Devin construye la entrega (cola, estados, reintentos, auditoría). Claude decide QUÉ se interviene (motor de políticas); la decisión `warn`/`block` ya existe como hipótesis en `EventDecision`. Nada implementado.

## Principio rector

El adaptador entrega mensajes **ya autorizados** por el motor de políticas. Nunca decide por sí mismo bloquear ni actúa sobre la salida cruda de un LLM.

## Modelo propuesto (migración futura)

```sql
CREATE TABLE intervention_deliveries (
  tenant_id UUID NOT NULL,
  delivery_id UUID NOT NULL,
  principal_id UUID NOT NULL,
  device_id UUID NOT NULL,
  event_id UUID NOT NULL,             -- evento que originó la decisión
  kind TEXT NOT NULL,                 -- warning_banner | notification | state_update
  payload_digest TEXT NOT NULL,       -- digest del mensaje, nunca contenido privado
  state TEXT NOT NULL DEFAULT 'pending',  -- pending|delivered|failed|cancelled
  attempts INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, delivery_id)
);
```

## Flujo

1. Dominio produce `EventDecision{decision=warn}` → aplica lo encola (puerto `InterventionSink`, propuesta para Claude).
2. Adaptador entrega vía canal del dispositivo: hoy `in_process` (callback test) y `webhook` (B20); push nativa cuando Cursor la implemente.
3. Reintentos: backoff exponencial `2^n * 15s`, máx 5 intentos, luego `failed` + evento de auditoría.
4. Cancelación: si la concesión se revoca antes de entregar → `cancelled`.

## Auditoría

Cada transición de estado escribe `intervention_audit(delivery_id, from_state, to_state, at, reason)` append-only. Sin contenido del mensaje en auditoría.

## Tests de aceptación

1. Entrega ok → `delivered` + `delivered_at` + audit.
2. Canal caído → reintentos con backoff (fake clock, sin sleeps reales) → `failed` tras 5.
3. Revocación antes de entregar → `cancelled`, sin entrega.
4. Entrega duplicada (reintento de la cola) → idempotente por `delivery_id`.
5. Payload nunca contiene texto de pantalla ni contenido privado — assert de campos permitidos.
6. `state_update` sin advertencia previa no genera ruido (supresión de duplicados por event_id+kind).

## Dependencias

- Puerto `InterventionSink` (propuesta → Claude).
- B8/B9 principal+device; B16 auditoría/retención; B20 webhook firmado.
- Canal `webhook` requiere el auth HMAC de B20 antes de activarse.
