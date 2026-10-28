# SOVIR — Instrucciones canónicas para agentes

Antes de cualquier trabajo, lee `README.md` y ADRs aplicables en `docs/adr/`. Este repositorio es un **scaffold de producto**: contiene un API Rust local de demostración, pero NO es una aplicación de protección en producción. No afirmes capacidades sin pruebas.

## Invariantes

1. Consentimiento específico y revocable; nunca evadir protecciones OS, sandbox o apps.
2. Local-first, mínima retención; no PII/capturas/credenciales en logs, tests, modelos externos ni Git.
3. Arquitectura hexagonal: `domain` sin dependencias de proveedores, UI, SQL u OS.
4. LLMs producen hipótesis tipadas; el motor de políticas autoriza acciones.
5. Inferencia remota bajo hard cap/allowlist, Standard mode para contenido privado; fixtures sintéticos por defecto.
6. Hechos, hipótesis, predicciones y objetivos se distinguen siempre.
7. No perfilar vulnerabilidades psicológicas de usuarios ni construir herramientas de influencia coercitiva.
8. No añadir permisos, SDKs o proveedores sin ADR, matriz de privacidad y revisión humana.

## Flujo obligatorio

- Recibe issue con `RUTAS EDITABLES`, contrato, acceptance tests y responsable único.
- En trabajo multiagente: worktree y branch por issue; no tocar módulos ajenos.
- Cambios pequeños; tests y contratos antes de lógica cuando corresponda.
- Corre `python3 scripts/harness.py check && python3 scripts/harness.py eval` y suite específica del módulo.
- Si un test no está implementado, repórtalo como `NOT_IMPLEMENTED`, nunca como `PASS`.
- Si cambias arquitectura, abre ADR antes de hacerlo.
- PR sin secretos, capturas reales ni cambios irreversibles. Merge solo con revisión del humano maintainer.

## Responsabilidades

- ChatGPT: arquitectura técnica/producto, ADR, contratos, evals y auditoría; puede implementar tickets de backend delimitados en PR con revisión independiente cuando esté autorizado; nunca fusiona sin aprobación del maintainer.
- Claude Code: implementación principal de backend Rust (dominio, puertos, ingestión, runtime local, políticas, inferencia, grafo, detectores y ML); contratos y evaluaciones.
- Cursor: frontend web y nativo, extensión, sensores con permisos OS, clientes tipados e integración con contratos backend aprobados; no implementa backend por defecto.
- Devin: backend de servicios, infraestructura, identidad/persistencia segura, seguridad operativa, jobs, observabilidad, CI/CD y facturación en PRs separados.
- Humano: responsable final de merges, permisos de plataforma, políticas, gasto, compliance.

## Skills y agentes por plataforma

Cada procedimiento vive en la carpeta de su rol. No copies una skill de Claude a Cursor, Devin o ChatGPT.

| Rol | Skills | Agentes | Puede tocar | No puede tocar |
|---|---|---|---|---|
| Cursor | `.cursor/skills/platform-permission-review`, `local-performance-profile` | `.cursor/agents/native-client-implementer`, `product-ui-implementer`, `platform-permission-reviewer` | `apps/`, `packages/ui-web`, adaptadores OS y clientes tipados | `crates/`, `services/`, contratos, infra, tokens de marca salvo ticket backend autorizado |
| Devin | `.devin/skills/api-contract-check`, `ci-performance-profile`, `release-readiness` | `.devin/agents/ci-infra-implementer`, `api-contract-checker`, `visual-ci-operator`, `release-checker` | `.github/`, `infra/`, `scripts/`, `services/` y tests de CI nombrados en el ticket | dominio, consentimiento, rediseño de UI, deploy |
| ChatGPT / Codex | `.agents/skills/product-architecture-review`, `product-cost-audit`, `eval-spec` | `.codex/agents/product-architect`, `cost-eval-reviewer` | `docs/` de producto, ADR y fixtures sintéticos; código backend SOLO por ticket específico autorizado | apps/UI; crates, servicios y contratos sin ticket/PR revisado |
| Claude | `.claude/skills/` | `.claude/agents/` | crates, contratos y revisiones de ML o seguridad | UI y permisos de OS sin ticket |

Devin también indexa `.claude/skills/` y `.agents/skills/`. Las skills de `.agents/skills/` solo se invocan de forma explícita y se detienen si el ejecutor no es ChatGPT o Codex. Cursor puede listar `.codex/agents/` por compatibilidad; esos agentes rechazan trabajo de implementación.

## Toolchains aplazadas

El arranque local usa Rust, Python, Node y Make. Docker, Postgres, Java, Android SDK, Xcode, Flutter y los proveedores de IA **no** se instalan todavía. La lista viva, con el momento en que cada una vuelve, está en `docs/operations/DEFERRED_TOOLCHAINS.md`. Léela antes de planear sensores, persistencia o inferencia remota. `NOT_INSTALLED` en esas herramientas no es un olvido.

## Contrato de resultados de agentes

Reportar: resumen preciso de cambios; archivos afectados; commands y resultados observados; cobertura no probada; riesgos; presupuesto de API/GPU incurrido; enlace al PR cuando exista. No prometer implementación futura sin ticket.

## Frontend and Design Governance
Before changing UI read `docs/design/FRONTEND_MASTER_PLAN.md` and `FRONTEND_GOVERNANCE.md`. Figma identity, tokens, screenshots and design reviews must be grounded in actual editable artifacts. No fake Figma node IDs. No UI-only risk logic, fake security coverage, dark patterns, hallucinated metrics or generic SaaS templates. `apps/website` is public marketing, `apps/console` authenticated work; native OS experiences are intentionally different. Need human signoff for brand, permissions and launch.


## Backend implementation addendum

For work in `crates/`, `services/`, `infra/postgres/`, read
`docs/backend/BACKEND_MASTER_PLAN.md` and ADR-0005. `make backend-check` must pass
with Rust installed before a backend PR merges. The local demo cannot be deployed
on the Internet. It has no tenant authentication, DB persistence or model access.


## Ownership definitivo del backend (2026-10-28)

Responsables **Claude Code, Devin y ChatGPT**; el humano mantiene la aprobación. Cursor no es dueño de los dominios B1–B21: construye frontend y sensores/adaptadores nativos en `apps/`, consumiendo contratos publicados. B9/B10/B11/B15/B20 incluyen lógica/backend de Claude y Devin y presentación/adaptadores de Cursor sin compartir archivos simultáneamente. Mapa y prioridades en `docs/operations/BRANCHES.md`; especificación en `docs/backend/BACKEND_MASTER_PLAN.md`.

Créditos temporales: Modal USD 100 confirmados por el maintainer durante la competencia; no utilizar GPUs ni APIs pagas sin presupuesto, control de cierre y ticket. Referencia de vigencia, incertidumbre y límites: `docs/operations/SPONSOR_CREDITS_2026-10-28.md`. Prohibido publicar tokens, credenciales o saldos asociados a una cuenta. No se autorizan merges por estos cambios documentales.
