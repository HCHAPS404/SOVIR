# Model card — `sovir-heuristic-local-0.1`

**Tipo:** tabla de reglas determinista (NO es un modelo ML). Adapter `HeuristicLocalInferenceGateway` en `crates/sovir-adapters`.

**Modo servido:** `Private` únicamente. `Standard` es rechazado estructuralmente — la ruta privada nunca egresa (ADR-0012).

## Qué hace

Mapea conjuntos de `RiskSignal` tipados a hipótesis tipadas con `confidence_bp` y `provenance: local_heuristic_rules`. No ve contenido: solo el enum de señales y `request_id`. Cada hipótesis corresponde a una regla documentada en el código (`RULES`).

## Métricas (corpus sintético `eval-inference-heuristic.v1.json`, 18 casos)

| Métrica | Valor | Nota |
|---|---|---|
| Hypothesis recall | 100% | gate — toda hipótesis esperada se produce |
| Exact-set match | 18/18 | reportado, no gatillado a futuro |
| Latencia p50 / p95 | 1µs / 68µs | en proceso, sin red |
| Recall por clase | adversarial 2/2, ambiguous 7/7, benign 2/2, clear_positive 7/7 | sintético |

Verificado en `heuristic_eval_corpus_reports_metrics` (cargo test). **Corpus 100% sintético — no hay claim de precisión contra fraude real.**

## Limitaciones declaradas

- Reglas estáticas: no aprende, no generaliza. Un patrón fuera de la tabla produce `no_pattern_detected`.
- Las señales de entrada son *untrusted hints* del edge — títulos de ventana y DOM pueden mentir (spoofing).
- `confidence_bp` es ordinal por regla, no una probabilidad calibrada.
- Hipótesis redundantes por diseño: una señal puede disparar regla fuerte + débil (ej. `credential_phishing` + `credential_request_unverified`).
- No infiere vulnerabilidades psicológicas ni afirma intención (invariantes 6–7).

## Reemplazo previsto

Un modelo local real (Gate 1 on-device) o provider verificado lo sustituye tras el puerto `InferenceGateway` sin tocar el dominio — la interfaz ya es la frontera.
