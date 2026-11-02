# ml/model-cards

Cards por votante/árbitro del concilio (ADR-0025). `registry.json` es el
índice machine-readable: cada nombre de votante cableado en
`services/api` debe aparecer aquí con su card — un test de
`sovir-adapters` verifica la cobertura.

| Votante | Card | Modalidad | Tier | Egress |
|---|---|---|---|---|
| `heuristic` | sovir-heuristic-local.md | señales tipadas | base | no |
| `remote` | sovir-remote-meta.md | señales tipadas (Meta) | deferred | sí — solo Standard |
| `onnx-visual` | (pending — seam cerrado) | visual | base | no |

Un votante ONNX nuevo entra SOLO con: artifact + licencia + card +
corpus de eval + gate verde (ADR-0024). Sin eso, `serves()` = false.
