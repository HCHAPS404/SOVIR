# Model card — `sovir-heuristic-local-0.2`

**Tipo:** tabla de evidencia ponderada determinista (NO es un modelo ML). Adapter `HeuristicLocalInferenceGateway` en `crates/sovir-adapters`.

**Modo servido:** `Private` únicamente. `Standard` es rechazado estructuralmente — la ruta privada nunca egresa (ADR-0012).

## Qué hace

Suma pesos por señal presente (`RiskSignal` tipada) por hipótesis; emite la hipótesis si el score alcanza su umbral (`HYPOTHESES` en el código). No ve contenido: solo el enum de señales y `request_id`. Las señales se deduplican antes de puntuar. `confidence_bp` del veredicto = mayor score crudo de hipótesis emitida (tope 10 000).

## Método de calibración (v0.2)

- Cada hipótesis tiene señales **ancla** (peso alto: la combinación requerida supera el umbral, ningún subconjunto estricto lo alcanza) y señales **corroborantes** (peso menor: gradúan el score sin disparar solas).
- Los umbrales quedan fijados por el corpus: los casos ambiguos (`cred_plus_urgency_no_identity` → sin `credential_phishing`; `payment_plus_identity_no_urgency` → sin `payment_fraud_attempt`; `exposure_limit_user_set` → solo `no_pattern_detected`) existen para verificar que ningún subconjunto dispara.
- `USER_DEFINED_EXPOSURE_LIMIT` no pesa en ninguna hipótesis: es gobernanza, no evidencia de amenaza.
- Deduplicación antes de puntuar: un enum repetido no duplica evidencia (caso `dup_style_signal_set`).

## Métricas (corpus sintético `eval-inference-heuristic.v1.json`, 18 casos)

| Métrica | Valor | Nota |
|---|---|---|
| Hypothesis recall | 100% | gate — toda hipótesis esperada se produce |
| Exact-set match | 18/18 | reportado, no gatillado a futuro |
| Latencia p50 / p95 | 1µs / 68µs | en proceso, sin red |
| Recall por clase | adversarial 2/2, ambiguous 7/7, benign 2/2, clear_positive 7/7 | sintético |

Verificado en `heuristic_eval_corpus_reports_metrics` (cargo test). **Corpus 100% sintético — no hay claim de precisión contra fraude real.**

## Limitaciones declaradas

- Reglas con pesos fijados a mano: no aprende, no generaliza. Un patrón fuera de la tabla produce `no_pattern_detected`.
- Las señales de entrada son *untrusted hints* del edge — títulos de ventana y DOM pueden mentir (spoofing).
- `confidence_bp` es una estadística de evidencia ordinal, no una probabilidad calibrada.
- Hipótesis redundantes por diseño: una señal puede disparar hipótesis fuerte + débil (ej. `credential_phishing` + `credential_request_unverified`).
- No infiere vulnerabilidades psicológicas ni afirma intención (invariantes 6–7).

## Reemplazo previsto

Un modelo local real (Gate 1 on-device) o provider verificado (ADR-0016) lo sustituye tras el puerto `InferenceGateway` sin tocar el dominio — la interfaz ya es la frontera.
