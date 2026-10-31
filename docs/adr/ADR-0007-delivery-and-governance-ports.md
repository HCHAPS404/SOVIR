# ADR-0007 — Puertos de entrega, gobernanza y nota sobre puertos async

- Estado: propuesto (pendiente aprobación maintainer)
- Contexto: ADR-0006 introdujo `SessionStore` y `DeviceRegistry`. Después, B15
  (intervenciones) y B16 (gobernanza) añadieron puertos y métodos que también
  modifican las fronteras hexagonales y quedaban sin ADR propio.

## Decisión

1. **`InterventionSink`** (`enqueue`, `due`, `list`, `update`,
   `delete_by_principal`, `list_by_device`) almacena intervenciones y su
   auditoría de transiciones. El sink es deliberadamente tonto: la política de
   reintentos (`next_attempt_ms`, `MAX_DELIVERY_ATTEMPTS`) y la selección de
   intervención por decisión (`intervention_for`) viven en dominio/aplicación.
2. **`DeliveryChannel`** (`send`) es la superficie de entrega real. El adaptador
   dev (`RecordingDeliveryChannel`) solo registra; canales reales
   (notificación OS, inbox nativo) serán adaptadores de plataforma autorizados.
3. **Gobernanza de datos**: `ConsentRepository`, `EventRepository` y
   `InterventionSink` ganan `list_by_principal`/`delete_by_principal`, y
   `SessionStore` `revoke_by_principal`. `GET /v1/me/data` exporta metadatos;
   `DELETE /v1/me/data` borra duro y revoca acceso (fail closed). Los devices
   se revocan (tombstone), no se borran; `DeviceRegistry::scrub_label`
   sustituye su `label` por `[redacted]` durante el purge, resolviendo la
   cuestión de retención del identificador amigable.
3bis. **Recibo de borrado**: `DeletionReceipt` (dominio) + puerto
   `DeletionReceiptStore` (`record`, `list_by_principal`). `purge_data`
   persiste un tombstone de auditoría con conteos y el id seudónimo del
   principal — nunca contenido. Tabla `deletion_receipts` (migración 0003).
3ter. **Retención ejecutable**: `EventRepository::delete_older_than` e
   `InterventionSink::delete_terminal_older_than` (solo estados
   `delivered`/`expired`; las pendientes deben aún intentos de entrega).
   `enforce_retention` es por principal invocante (`POST /v1/me/retention`,
   cutoff = `SOVIR_RETENTION_MS`, def. 30 días). Un barrido global
   programado es decisión de infraestructura, no de este puerto.
4. **Consistencia fail-closed**: revocar un dispositivo expira sus
   intervenciones pendientes (`list_by_device` + `update` con entrada de
   auditoría `device revoked`).
5. **Tokens**: generación por UUIDv4 (`uuid` dep). Los tokens dev dejaban de
   derivarse de inputs; se corrigió antes de que el formato se fijara en
   fixtures externos.
6. **Nota async**: los puertos son síncronos y `sovir-persistence` los ejecuta
   sobre sqlx con `block_in_place` + `Handle::block_on`. Es un puente de
   desarrollo válido solo en runtime multi-thread. Migrar los puertos a async
   (`async_trait` o firmas genéricas) es un ADR separado que conviene tomar
   antes de añadir más adaptadores de I/O.

## Consecuencias

- Sin canal de entrega real: `Delivered` significa "entregado por el canal
  registrado", que en dev es un stub. No afirmar notificación real.
- El borrado produce `DeletionReceipt` durable; el recibo en sí es metadato
  de auditoría y sobrevive al purge deliberadamente.
- `list_by_device` solo filtra `pending`/`failed`: las entregadas/expiradas
  son inmutables salvo borrado por gobernanza.
