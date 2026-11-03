<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/website/public/brand/icon-paper.png">
  <source media="(prefers-color-scheme: light)" srcset="apps/website/public/brand/icon-ink.png">
  <img alt="SOVIR — símbolo Umbral" src="apps/website/public/brand/icon-ink.png" width="132">
</picture>

<h1>SOVIR</h1>

<p><strong>Digital Autonomy Intelligence</strong><br>
<em>See clearly. Decide freely.</em></p>

<p>
Escudo local-first contra estafas, suplantación, rastreo y diseño manipulativo —<br>
sensores consentidos, concilio de votantes y decisiones explicables, auditables y revocables.
</p>

<p>
<a href="https://github.com/HCHAPS404/SOVIR/actions/workflows/backend.yml"><img alt="Backend Gate" src="https://github.com/HCHAPS404/SOVIR/actions/workflows/backend.yml/badge.svg"></a>
<a href="https://github.com/HCHAPS404/SOVIR/actions/workflows/ci.yml"><img alt="Scaffold Gate" src="https://github.com/HCHAPS404/SOVIR/actions/workflows/ci.yml/badge.svg"></a>
<a href="https://github.com/HCHAPS404/SOVIR/actions/workflows/visual.yml"><img alt="Visual Gate" src="https://github.com/HCHAPS404/SOVIR/actions/workflows/visual.yml/badge.svg"></a>
<a href="https://github.com/HCHAPS404/SOVIR/actions/workflows/deps-audit.yml"><img alt="Dependency Audit" src="https://github.com/HCHAPS404/SOVIR/actions/workflows/deps-audit.yml/badge.svg"></a>
</p>

<p>
<img alt="Rust" src="https://img.shields.io/badge/core-Rust-1a1a1a?logo=rust&logoColor=white">
<img alt="TypeScript" src="https://img.shields.io/badge/surfaces-TypeScript-1a1a1a?logo=typescript&logoColor=white">
<img alt="Kotlin" src="https://img.shields.io/badge/android-Kotlin%20Compose-1a1a1a?logo=kotlin&logoColor=white">
<img alt="Contract" src="https://img.shields.io/badge/contract-backend--dev.v0-8a6d3b">
<img alt="Status" src="https://img.shields.io/badge/status-local--production%20scaffold-8a6d3b">
</p>

<p>
<a href="#-qué-es-sovir">Producto</a> ·
<a href="#-estado-real">Estado real</a> ·
<a href="#-arquitectura">Arquitectura</a> ·
<a href="#-quickstart">Quickstart</a> ·
<a href="#-documentación">Docs</a> ·
<a href="docs/product/PRODUCT_SPEC.md"><strong>Especificación maestra</strong></a>
</p>

</div>

---

> [!IMPORTANT]
> **Esto es un scaffold local-producción verificado, no un producto publicado.**
> El pipeline completo funciona en local hoy (sensor → consentimiento → concilio →
> decisión → consola), pero no hay instaladores, tiendas, multi-tenant real ni un
> modelo visual listo. Todo lo afirmado aquí tiene evidencia o se marca explícito
> como `NOT_IMPLEMENTED` / `NOT READY`. La especificación completa del producto
> objetivo vive en [`docs/product/PRODUCT_SPEC.md`](docs/product/PRODUCT_SPEC.md).

## 🛡️ Qué es SOVIR

Un **escudo de autonomía digital**: observa — con permiso explícito — lo que las
páginas y apps le piden al usuario, detecta mecanismos de ingeniería social y
fraude, y devuelve una decisión explicable. No es antivirus, no es un chatbot al
que pegar capturas, y no es vigilancia.

| | |
|---|---|
| 🔐 **Consent-first** | Nada se observa sin grant por fuente y dispositivo; revocar detiene todo en el siguiente ciclo de evento. |
| 🏠 **Local-first** | Señales tipadas y digests — nunca texto crudo, píxeles ni PII salen del dispositivo por defecto. |
| 🧠 **Concilio, no oráculo** | Votantes independientes (heurística, ONNX texto, ONNX visual, remoto autorizado) emiten hipótesis con `votes[]` auditable; la política determinista decide. |
| 📖 **Explicable** | Cada veredicto lleva evidencia, procedencia e incertidumbre. Hechos ≠ hipótesis ≠ acciones. |
| 💰 **Coste gobernado** | Inferencia remota detrás de allowlist + hard cap de presupuesto; agotar tokens jamás apaga la protección local. |

## ✅ Estado real

Lo que corre hoy, con la prueba que lo respalda:

| Pieza | Estado | Evidencia |
|---|:---:|---|
| API Rust (Axum) + PostgreSQL 17 | ✅ local-producción | Migraciones 0001–0012, RLS activo, eventos reales persistidos |
| OIDC / Keycloak 26.4 | ✅ verificado | JWT reales validados por JWKS (`JwksIdentityVerifier`), PKCE en clientes |
| Extensión (MV3) → backend | ✅ E2E en Chromium real | `live_check.mjs`: connect → observación → Postgres → `warn/high` → badge |
| ONNX en service worker | ✅ inferencia real | `ort` 1.16.3 wasm, modelo visual 3.7 MB corre en el worker MV3 |
| Consentimiento | ✅ gate sostiene | Captura rechazada sin grant; renovación 24 h sin resucitar tombstones |
| Consola web | ✅ datos reales | Incidents, investigations, webhooks, backup cifrado, `/v1/metrics`, feedback |
| Android (Compose) | 🟡 app real | Login OIDC, observer de accesibilidad, alert sync — sync en vivo pendiente |
| Sitio público (`apps/website`) | ✅ desplegado local | Landing Umbral servida por funnel `/web` |
| URL pública estable | ✅ activa | Tailscale Funnel → [`docs/operations/TAILSCALE_FUNNEL.md`](docs/operations/TAILSCALE_FUNNEL.md) |
| Modelo visual ONNX | 🔴 **NOT READY** | Corre, pero 13 % FP benigno / ~3 % recall → [`model card`](ml/model-cards/sovir-onnx-visual.md) |
| iOS / Desktop | ⬜ `NOT_IMPLEMENTED` | Scaffold UI solamente; sin toolchains en esta máquina |

## 🧩 Superficies

| App | Stack | Rol | Estado |
|---|---|---|---|
| `apps/extension` | MV3 · TS · ONNX Runtime Web | Observador de navegador: señales DOM + visión local por sitio autorizado | ✅ verificado en vivo |
| `apps/console` | Next.js · React | Centro de control: incidentes, investigaciones, políticas, webhooks, backup | ✅ datos reales |
| `apps/website` | Next.js | Marketing público identidad Umbral | ✅ servida |
| `apps/android` | Kotlin · Compose | Observador + consola móvil; tokens sellados con Keystore | 🟡 build + login |
| `apps/desktop` | Tauri · React | Shell escritorio | ⬜ `NOT_IMPLEMENTED` |
| `apps/ios` | SwiftUI | Cliente iOS | ⬜ `NOT_IMPLEMENTED` (sin Xcode en Windows) |

## 🏗️ Arquitectura

Hexagonal local-first: el dominio nunca importa UI, SQL ni proveedores; la
inferencia remota es un puerto opcional detrás de presupuesto y allowlist.

```mermaid
flowchart LR
    subgraph surfaces["Superficies — señales tipadas solamente"]
        ext["🧩 Extensión MV3<br/>DOM + ONNX visual local"]
        droid["🤖 Android<br/>accessibility observer"]
        console["🌐 Consola<br/>incidentes · investigación"]
    end

    subgraph api["API — Axum :8787"]
        consent["🔐 Privacy gate<br/>grant por fuente+dispositivo"]
        council["🧠 Concilio de votantes<br/>heurístico · ONNX texto · ONNX visual"]
        policy["⚖️ Policy engine<br/>decisión autoritativa"]
    end

    pg[("🐘 PostgreSQL 17<br/>grants · eventos · decisiones · RLS")]
    kc["🔑 Keycloak 26<br/>realm sovir · JWKS"]
    meta["☁️ Meta Model API<br/>señales tipadas · hard cap"]
    cache["⚡ Caché inferencia<br/>digest señales · TTL"]

    ext -->|POST /v1/events| consent
    droid -->|POST /v1/events| consent
    consent --> council
    council --> cache --> policy --> pg
    council -.->|allowlist + budget cap| meta
    console -->|GET /v1/*| pg
    api --- kc
```

| Capa | Crates / servicios |
|---|---|
| Dominio | `sovir-domain` — invariantes, sin efectos |
| Aplicación | `sovir-application` — casos de uso, decisión, consentimiento |
| Puertos | `sovir-ports` — traits de persistencia, inferencia, consentimiento |
| Adaptadores | `sovir-adapters`, `sovir-persistence` — Pg, ONNX, votantes, egress |
| Servicio | `services/api` — HTTP, auth, council, métricas |
| Contratos | `packages/contracts` OpenAPI `backend-dev.v0` + SDK TS generado |

## 🚀 Quickstart

```powershell
# 1. Stack local — Postgres portable + Keycloak + API + frontends
scripts\db-dev.ps1       # Postgres portable + migraciones
scripts\api-dev.ps1      # API en :8787 (ver docs/operations/B21_LOCAL_DEV.md)

# 2. Gates backend
make backend-check        # cargo fmt/clippy/test + harness

# 3. Extensión: chrome://extensions → Developer mode → Load unpacked → apps/extension
#    Live-check automatizado (Chromium real, sin interacción):
node apps/extension/scripts/live_check.mjs
```

**Acceso público estable** (demo, PC encendido):
`https://hell.taile32c7d.ts.net` — `/` consola · `/api` API · `/sso` Keycloak · `/web` sitio.
Configuración y límites: [`docs/operations/TAILSCALE_FUNNEL.md`](docs/operations/TAILSCALE_FUNNEL.md).
*No es producción: es la máquina de desarrollo expuesta para pruebas reales.*

## 📚 Documentación

| Área | Documento |
|---|---|
| **Producto** | [Especificación maestra §0–§28](docs/product/PRODUCT_SPEC.md) · [ADRs](docs/adr/) |
| **Backend** | [Master plan](docs/backend/BACKEND_MASTER_PLAN.md) · [Bootstrap](docs/operations/BACKEND_BOOTSTRAP.md) · [ENV reference](docs/operations/ENV_REFERENCE.md) |
| **Frontend/diseño** | [Master plan](docs/design/FRONTEND_MASTER_PLAN.md) · [Gobernanza](docs/design/FRONTEND_GOVERNANCE.md) · [Figma workflow](docs/design/FIGMA_WORKFLOW.md) |
| **Operaciones** | [SLOs](docs/operations/SLOS.md) · [Tailscale Funnel](docs/operations/TAILSCALE_FUNNEL.md) · [Named tunnel](docs/operations/NAMED_TUNNEL_MIGRATION.md) · [Toolchains diferidos](docs/operations/DEFERRED_TOOLCHAINS.md) · [Branches](docs/operations/BRANCHES.md) |
| **ML** | [Model cards](ml/model-cards/) · [Pipelines](ml/pipelines/) · [docs/ml](docs/ml/) |
| **Agentes** | [AGENTS.md](AGENTS.md) · [CLAUDE.md](CLAUDE.md) · [.cursor/rules](.cursor/rules/) |
| **Auditoría** | [Auditoría pre-commit](docs/audits/AUDITORIA_PRECOMMIT_2026-10-27.md) |

## 🗺️ Roadmap

| Hito | Capacidad | Estado |
|---|---|---|
| H0–H1 | Fundación + core Rust + privacy gateway | ✅ |
| H2 | Sensores: extensión (hecho) · Android (parcial) · desktop/iOS | 🟡 |
| H3 | Semantic delta + motor local | 🟡 |
| H4 | Evidence graph + razonamiento remoto tipado | 🟡 |
| H5 | Autonomy center + intervenciones | 🟡 |
| H6 | Packs de dominio (FraudShield, MarketShield…) | ⬜ |
| H7 | Predicción adaptativa + cost engine | 🟡 |
| H8 | Sync cifrada + collective intel + SDK | ⬜ |
| H9 | Hardening + comercialización | ⬜ |

Detalle y criterios de aceptación: [espec §23](docs/product/PRODUCT_SPEC.md#23-hitos-y-orden-de-implementación).

## 🤖 Trabajo multiagente

Cuatro roles, un maintainer humano con autoridad final:

| Rol | Área | Reglas |
|---|---|---|
| **Claude Code** | Dominio/puertos Rust, ML, contratos | [CLAUDE.md](CLAUDE.md) |
| **Cursor** | Apps, UI, sensores OS | [.cursor/rules/](.cursor/rules/) |
| **Devin** | Servicios, infra, identidad, CI | [.devin/](.devin/) |
| **ChatGPT** | Arquitectura, ADRs, evals, auditoría | [.agents/skills/](.agents/skills/) |
| **Humano** | Merges, permisos, gasto, releases | [AGENTS.md](AGENTS.md) |

Un ticket = un owner + rutas editables + criterios verificables. Sin merges sin
revisión humana; sin atribución de agente en commits.

## 🔒 Invariantes

- **Consentimiento específico y revocable** antes de cualquier observación.
- **Nada de texto crudo/píxeles/PII** en logs, fixtures, egress o Git.
- **Fail-closed**: revocado → detiene colección y transmisión.
- **Proveedor = puerto**; jamás dependencia del dominio.
- **Claims medidos o marcados** `NOT_IMPLEMENTED` — nunca inventados.

---

<div align="center">
<sub><strong>SOVIR</strong> — nombre de trabajo pendiente de validación legal ·
infraestructura protectora para que cada persona conserve el control de su vida digital.<br>
Reportes de seguridad: ver política en desarrollo · © 2026 SOVIR</sub>
</div>
