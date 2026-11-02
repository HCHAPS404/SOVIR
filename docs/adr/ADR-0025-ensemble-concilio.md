# ADR-0025 — Motor de inferencia por concilio (votación multi-modelo con arbitraje de política)

Estado: propuesto (pendiente signoff del maintainer)
Fecha: 2026-11-02

## Contexto

Hoy `assess_with_inference` consulta UN solo gateway por modo de privacidad
(heurístico local o remoto). La visión del producto pide varios modelos en
paralelo — texto, patrones visuales, estructura — que produzcan un
veredicto integrado con datos estructurados. El invariante exige: modelos
proponen hipótesis tipadas; la política decide. El "concilio" formaliza
eso: N votantes → matriz de votos → política árbitro.

## Decisión

**Votantes** (cada uno implementa `InferenceGateway`, misma interfaz):

| Votante | Cubre | Costo | Modo |
|---|---|---|---|
| Heurístico local | texto/señales estructurales | 0, 17µs | Private+Standard |
| ONNX visual (ADR-0024) | image_lure, brand_impersonation, QR | 0, CPU | Private+Standard |
| ONNX texto/patrón | clasificación de copy scam vs legítimo | 0, CPU | Private+Standard |
| Remoto (Meta) | razonamiento semántico sobre sobre tipado | ~$0.02 | Standard only |

**Flujo del concilio** en `assess_with_inference`:

1. `CouncilGateway` fans-out a los votantes que `serves(privacy)` —
   en Private el remoto ni se invoca (no sale nada).
2. Cada votante devuelve `InferenceVerdict` con hipótesis + confidence +
   provenance (`local:heuristic`, `local:onnx-x`, `remote:api.meta.ai`).
3. **Árbitro = política, no modelo**: reglas deterministas sobre la
   matriz — unanimidad sube confidence; disenso marca `disputed:true` y
   el tipo de desacuerdo (`visual_says_lure_text_says_benign`); veto
   estructural local (p.ej. `SEED_PHRASE_REQUEST`) gana siempre.
4. El veredicto integrado lleva `votes: Vec<VoterVerdict>` — cada voto
   auditable por separado; la respuesta final muestra el desglose.

**Contrato**: `InferenceVerdict.votes: Option<Vec<...>>` — aditivo,
compatible con el schema actual.

## Honesto — modos de fallo del concilio

- Ensembles no suman precisión gratis: votantes correlacionados (todos
  leen el mismo vocabulario) votan el mismo error. La diversidad real
  viene de modalidades distintas (texto vs estructura vs imagen).
- Disenso ≠ neutralidad: una regla de "mayoría" dejaría al heurístico
  v0 ganando siempre — el árbitro pondera por dominio de la señal
  (lo visual decide lo visual, lo semántico decide lo textual).
- Cada votante nuevo es un artifact: model-card, licencia, eval propio
  contra el corpus — sin eval no entra al concilio (misma puerta que
  ADR-0024).
- Costo Meta controlado: el remoto solo se invoca cuando los locales
  no alcanzan umbral de acuerdo — concilio ahorra tokens, no los quema.

## Verificación

- `harness.py eval` reporta agreement del concilio vs corpus por clase;
  nuevos casos de disenso (local dice lure, remoto dice benigno) con
  expectativa fijada por la política.
- Test: Private mode nunca toca el gateway remoto (assert de no-llamada).
- Veredicto con `votes` desglosado visible en `/v1/inference/assess` y
  consola (provenance por votante).
