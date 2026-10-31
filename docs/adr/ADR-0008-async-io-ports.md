# ADR-0008 — Puertos de I/O asíncronos

- Estado: propuesto (pendiente aprobación maintainer)
- Contexto: ADR-0007 dejó una nota explícita — los puertos eran síncronos y
  `sovir-persistence` los ejecutaba sobre sqlx mediante
  `block_in_place` + `Handle::block_on`, un puente válido solo en runtime
  multi-thread que podía paniquear fuera de él y confundir al scheduler.

## Decisión

Todos los puertos de I/O se declaran asíncronos con `async_trait`
(dyn-compatible, requerido por `Arc<dyn Port>`):

`ConsentRepository`, `EventRepository`, `SessionStore`, `DeviceRegistry`,
`InterventionSink`, `DeliveryChannel`, `WebhookRegistry`, `HttpEgress`,
`DeletionReceiptStore`.

`Clock` y `RiskAnalyzer` permanecen síncronos: son cómputo puro sin I/O.

Consecuencias sobre capas:

- `sovir-persistence` usa sqlx nativamente y elimina `block()` — sin riesgo
  de runtime equivocado y con backpressure real del pool.
- `sovir-adapters` in-memory mantiene `Mutex`/`RwLock` estándar: las secciones
  críticas son O(1) y no cruzan `.await`, así que no hace falta `tokio::sync`.
- `sovir-application` expone métodos `async`; la API solo añade `.await`.
- El benchmark envuelve iteraciones en `b.to_async(&rt)` — medida honesta del
  camino async, no del puente anterior.
- Retención global: `delete_older_than_any` /
  `delete_terminal_older_than_any` se añaden en el mismo paso para el barrido
  programado (ver migración 0004 y `SOVIR_RETENTION_SWEEP_MS`).

## Consecuencias

- `async-trait 0.1` queda como dependencia de ports/adapters/persistence/
  application/api. Cuando `async fn` en trait público dyn-compatible sea
  estable sin macro, la capa `#[async_trait]` se retira sin cambios de API.
- Ningún puerto expone tipos de proveedor; la frontera hexagonal se mantiene.
