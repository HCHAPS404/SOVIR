# SOVIR — SLOs y contadores operativos (B7)

Estado: borrador honesto para el demo local. Estos son objetivos de diseño y
contadores ya implementados — **no** SLAs de producción medidos contra tráfico real.

## Contadores implementados (`GET /v1/metrics`, loopback-only)

| Counter | Qué mide |
|---|---|
| `sovir_requests_total` | Requests HTTP atendidos por el API |
| `sovir_events_ingested_total` | Eventos de observación persistidos |
| `sovir_interventions_total` | Intervenciones emitidas por el motor de políticas |
| `sovir_sessions_issued_total` | Sesiones emitidas (dev-session u OIDC) |
| `sovir_consents_granted_total` | Grants de consentimiento creados |
| `sovir_consents_revoked_total` | Grants revocados |
| `sovir_devices_registered_total` | Dispositivos registrados |
| `sovir_rate_limited_total` | Requests rechazados por rate limit |
| `sovir_errors_5xx_total` | Errores internos del servidor |

Render: panel "Salud del backend" en el dashboard de consola (modo dev).

## SLOs propuestos (targets, no garantías)

| Señal | Objetivo | Nota |
|---|---|---|
| Disponibilidad API local | ≥ 99% durante sesiones de prueba | Sin load balancer; proceso único |
| Latencia ingest `POST /v1/events` p50 | < 50 ms | Local Postgres, sin egress |
| Decisión de política p50 | < 10 ms | Determinista, en proceso |
| Concilio local completo (heurístico + ONNX texto/visual) | < 2 s | CPU, sin GPU |
| Votante remoto (Standard) | aborta a `SOVIR_REMOTE_TIMEOUT_MS` (default 8 s) | Hard timeout + abstención auditable |
| Errores 5xx | < 1% de requests | `sovir_errors_5xx_total` |
| Rate-limit falsos | 0 en tráfico legítimo de demo | `sovir_rate_limited_total` |

## Lo que falta para SLOs reales

- Histogramas de latencia (hoy solo hay contadores — sin `*_bucket`).
- Persistencia de métricas fuera del proceso (Prometheus scrape remoto = egress).
- Alertas (no hay alertmanager ni superficie de alertas).
- Tráfico real multi-dispositivo para medir los targets.
