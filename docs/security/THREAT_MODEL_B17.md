# B17 — Modelo de amenazas y registro de riesgos (iteración 1)

**Estado:** iteración inicial sobre el scaffold real. Se actualiza por PR cuando cambie la superficie. No es una auditoría completa ni certifica el sistema como seguro.

## Alcance evaluado

Componentes existentes: `services/api` (Axum, loopback), crates de dominio/aplicación/puertos/adapters, `sovir-inference`, `services/migrations`, contratos, CI.

## STRIDE por componente

| Componente | S | T | R | I | E | D | Amenaza principal y control actual |
|---|---|---|---|---|---|---|---|
| `services/api` HTTP | ✓ | ✓ | — | ✓ | — | — | Suplantación: bearer dev único (mitigado: loopback-only, fail closed a remote inference). Tampering/info disclosure: body limit 64 KB, timeout 30 s, request-id. **Abierto:** sin auth real → B8. |
| Consent grants (memoria) | ✓ | ✓ | ✓ | — | ✓ | — | Suplantación de principal vía `grant_id` en body — **riesgo aceptado SOLO en dev**, prohibido exponer. DoS por grants infinitos en memoria — abierto (cap pendiente). |
| Event ingestion | — | ✓ | — | ✓ | — | ✓ | Eventos=datos no confiables (diseño). Dedup por `event_id` in-memory; replay cross-restart posible → B10 (idempotency durable). DoS por flood → rate limit pendiente B10/B17. |
| DeterministicRiskAnalyzer | — | — | — | — | — | — | Salida es hipótesis, no acción; `protected_action_executed=false`. Correcto por diseño. |
| `sovir-inference` governor | — | ✓ | — | — | — | — | Reservas in-memory perdedoras en crash → gasto doble teórico; remoto bloqueado hoy. Durable ledger pendiente (B4/B7). |
| `sovir-migrations` | — | ✓ | — | ✓ | — | — | DATABASE_URL en env (no en Git); CI usa password efímera documentada como tal. Migraciones con `undo` total: uso solo dev/CI. |
| Postgres (propuesto) | ✓ | — | — | ✓ | ✓ | — | RLS habilitada sin policies = default-deny (correcto). Sin rol app aún; nunca BYPASSRLS. |
| CI workflows | — | ✓ | — | ✓ | — | — | `contents: read` mínimo; sin secretos en workflows; token dev de CI es literal efímero. Supply chain: `cargo deny`+`audit`+gitleaks desde B21-A. |
| Logs/tracing | — | — | — | ✓ | — | — | Solo método/path/status/request-id; bodies y tokens jamás logueados (assert pendiente B16). |

## LINDDUN (privacidad)

| Categoría | Riesgo en SOVIR | Mitigación actual / pendiente |
|---|---|---|
| Linkability | Mismo `principal_id` enlaza eventos entre fuentes | Principal opaco del IdP (B8); digests, no contenido |
| Identifiability | Events aún sin principal real | B8; hoy solo sintético |
| Non-repudiation | Auditoría podría permitir negación indebida o exposición | Audit log append-only diseñado en B16, sin contenido sensible |
| Detectability | Adversario detecta que se le observa | SOVIR nunca observa sin consentimiento OS-level (invariante) |
| Disclosure | PII a logs/proveedores | SECRET rechazado; payload_ref bloqueado en fixtures; redacción estructural B16 |
| Unawareness | Usuario no sabe qué se recolecta | Consent granular por fuente/modalidad (invariante ADR-0002) |
| Non-compliance | Retención ilimitada | Matriz B16 + job de purga pendiente |

## Riesgos residuales registrados

| # | Riesgo | Severidad | Estado | Dueño del fix |
|---|---|---|---|---|
| R1 | `grant_id`/`source_id` autodeclarables en body | alta si se expone | aceptado en dev-loopback; bloquea cualquier despliegue | B8+B10 |
| R2 | Estado en memoria: restart borra concesiones/dedup | media | documentado; durable store pendiente | B16/B10 |
| R3 | Sin rate limiting en `/v1/events` | media | abierto | B10/B17 |
| R4 | Migración revert total borra schema | baja (solo dev/CI) | documentado en runner | — |
| R5 | Sin attestation de dispositivo | alta en producción | diseño B9 | B9/B17 |
| R6 | Prompt-injection vía contenido observado hacia LLM futuro | alta | mitigado: eventos nunca como system prompt; aislado en B4 | Claude/B4 |

## Reglas permanentes (de ADRs + misión)

- Eventos de sensores = datos, nunca instrucciones. Salida de LLM = hipótesis tipada; solo el motor de políticas autoriza.
- Sin cripto propia; mecanismos estándar auditados. Secretos fuera de Git; `gitleaks` en CI.
- Cambios de cripto/control de acceso requieren revisión independiente.
- La API dev nunca se expone: bind no-loopback rechazado en arranque (verificado en código).
