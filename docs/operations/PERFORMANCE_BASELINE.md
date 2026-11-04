# SOVIR — Baseline de rendimiento (H3)

Medido con `cargo bench -p sovir-application --bench ingest -- --noplot`
(criterion, perfil `bench`/release, adaptadores **in-memory**).
Máquina: estación de desarrollo Windows del maintainer, 2026-07-25, commit `4246c61`.

> Esto mide el path lógico en memoria — consentimiento, validación, dedup por
> contenido, análisis determinista, detección de secuencias. **No** mide
> Postgres, red, ONNX, ni un dispositivo físico. Es una cota inferior
> representativa del costo por evento del motor local.

## Resultados observados

| Benchmark | Tiempo medio | CI (criterion) | Qué cubre |
|---|---|---|---|
| `ingest_synthetic_event` | ~1.6 µs | 1.60–1.65 µs | consent + dedup + análisis + persistencia in-mem |
| `assess_inference_private` | ~1.29 ms | 1.25–1.33 ms | scope check + reserva presupuesto + heurístico + settle + audit |
| `investigation_over_100_events` | ~3.2 µs | 3.02–3.32 µs | scan acotado + agregación + secuencias + audit |
| `ingest_after_revocation` | ~856 ns | 852–861 ns | rechazo fail-closed tras revocar grant |

## Límites adoptados (revisables por ADR)

| Operación | Límite | Observado | Margen |
|---|---|---|---|
| Ingest in-mem por evento | < 100 µs | ~1.6 µs | ~60× |
| Inferencia privada completa | < 10 ms | ~1.3 ms | ~7× |
| Rechazo post-revocación | < 100 µs | ~0.86 µs | ~110× |

Los límites son de diseño para el scaffold; si un commit los excede de forma
sostenida en CI (`benchmark` job de `backend.yml`), hay que justificarlo.

## Lo que NO cubre este baseline

- **Postgres**: latencia real de `insert_once`/`list_recent` contra disco.
  Pendiente: bench con `sovir-persistence` sobre Postgres local.
- **RAM**: criterion no mide residente. Pendiente: medición con perf/OS
  (`local-performance-profile` skill) por superficie.
- **Energía**: sin medidor disponible en esta estación. Android requiere
  `adb shell dumpsys batterystats` o Perfetto — pendiente como medición física.
- **Extractor/extension/OCR**: este bench mide el servicio, no el extractor
  JS ni el OCR selectivo de `sovir-edge-extract`.

## Cómo re-ejecutar

```bash
cargo bench -p sovir-application --bench ingest -- --noplot
# Resultados históricos en target/criterion/
```

En CI: job `benchmark` de `.github/workflows/backend.yml`, artefacto
`criterion-ingest`.
