# Model card — `sovir-remote-meta` (votante remoto del concilio)

**Tipo:** LLM remoto OpenAI-compatible (Meta `muse-spark-1.3` en la
configuración local). Adapter `RemoteInferenceGateway` en
`crates/sovir-adapters`. Votante **diferido** del `CouncilGateway`
(ADR-0025): solo se invoca cuando los votantes locales no resuelven.

**Modo servido:** `Standard` únicamente. `Private` es filtrado por
`serves()` ANTES de cualquier llamada — un request `Private` jamás
egresa (ADR-0012, test `council_private_excludes_remote_before_call`).

## Qué recibe

Únicamente el sobre tipado: `request_id`, `Vec<RiskSignal>` (enums) y
`privacy`. Jamás contenido de página, capturas, píxeles, credenciales
ni PII (invariantes 2 y 5). La redacción es estructural: no hay texto
que redactar porque el texto nunca entra al request.

## Qué devuelve

Hipótesis tipadas + `confidence_bp` + provenance + `usage` reportado
por el proveedor (tokens in/out → costo real cuando hay precios
configurados; si el proveedor no reporta, se asienta el estimado).

## Costo y presupuesto

- Reserva atómica por `request_id` (`BudgetReservations`) — una
  reserva cubre el voto agregado; el `usage.cost_micro_usd` del
  proveedor es el actual preferido en el settle.
- Ventanas día/mes (`SOVIR_MAX_USD_PER_DAY` / `_PER_USER_MONTH`) como
  pre-check; cap total en el gate atómico.
- Precios estimados por env (`SOVIR_INFERENCE_PRICE_*_MICROS_PER_MTOK`)
  — reemplazar cuando haya tarifas oficiales.

## Limitaciones declaradas

- Razona sobre señales, no sobre evidencia primaria — un sobre
  empobrecido produce un voto empobrecido.
- Sin garantía de disponibilidad: timeouts/errores degradan a
  `local_settled`/voto ausente, nunca a un veredicto fabricado.
- La confianza reportada no está calibrada contra un corpus SOVIR.
- Versión del modelo la fija el proveedor; un cambio de artefacto es
  un cambio de comportamiento que el eval debe detectar.
