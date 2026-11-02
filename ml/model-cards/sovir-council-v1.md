# Model card — `sovir-council-v1` (árbitro del concilio)

**Tipo:** compositor determinista de votantes (NO es un modelo — no
aprende). `CouncilGateway` en `crates/sovir-adapters`; reglas de
arbitraje `arbitrate_votes` / `local_votes_settle` en `sovir-domain`.

**Rol (ADR-0025):** fan-out del `InferenceRequest` a los votantes que
`serves(privacy)`, fusión determinista de hipótesis, etiqueta de
resultado en provenance, y `votes[]` completo para auditoría. Nunca
decide una acción — eso sigue siendo del motor de políticas.

## Reglas de arbitraje (fuente única: `sovir-domain`)

- `Agree` — al menos dos votantes posicionados comparten una hipótesis.
- `Disputed` — ≥2 votantes posicionados sin hipótesis compartida. Es un
  marcador de revisión explícito; nunca una mayoría silenciosa.
- `Single` — un solo voto posicionado.
- `LocalSettled` — los votantes base resolvieron (acuerdo local o
  confianza ≥ `settle_confidence_bp`) y los diferidos no se invocaron.
- `no_pattern_detected` no es posición: no crea acuerdo ni disputa.

## Deferral (ahorro de tokens)

Con `CouncilGateway::deferred`, los votantes remotos solo se invocan
cuando los locales no resuelven. `SOVIR_COUNCIL_SETTLE_BP` (default
8000) fija el piso de confianza local. Un caso claro nunca gasta un
token remoto — verificado por
`council_confident_local_settles_without_remote_call` (egress vacío).

## Fusión de hipótesis

Unión rankeada por la `confidence_bp` del votante que emitió cada
hipótesis; empates conservan orden de llegada (determinista).
`confidence_bp` del veredicto = máximo de los votos. `usage` = suma de
los `usage` reportados; `cost_micro_usd` agregado solo si todos los
votos lo reportan (si alguno falta, el costo real queda `None` y se
asienta el estimado — honesto).

## Fallos

- Un votante que falla se omite del `votes[]` (su ausencia es visible).
- Todos fallan → `Err(Unavailable)` — jamás un veredicto vacío.
- Votantes no-serving para el modo se filtran antes de la llamada:
  `Private` nunca toca un gateway remoto.

## Limitaciones declaradas

- `Disputed` no elige ganador — el consumidor (política/consola) decide
  el tratamiento; la disputa queda registrada, no resuelta por voto.
- La unión rankeada puede sobre-representar hipótesis cuando un votante
  ruidoso emite muchas — la precisión final depende de la política.
