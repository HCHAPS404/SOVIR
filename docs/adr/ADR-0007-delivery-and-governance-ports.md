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
   se revocan (tombstone), no se borran — decisión revisable: su `label`
   persiste hasta una política de retención (B16 abierto).
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
- El borrado no produce recibo durable (solo `PurgeReport` en respuesta);
  tabla de auditoría de erasures queda para B16 completo.
- `list_by_device` solo filtra `pending`/`failed`: las entregadas/expiradas
  son inmutables salvo borrado por gobernanza.
