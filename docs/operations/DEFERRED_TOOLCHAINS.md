# Toolchains aplazadas

**Estado:** recordatorio activo. Aprobado por el maintainer el 27 de octubre de 2026.  
**No es una lista olvidada:** cualquier trabajo que dependa de una fila de esta tabla debe volver aquí antes de instalar o de afirmar que el entorno está listo.

## Instalado para el arranque

Rust stable, `rustfmt`, `clippy`, Python 3.12 (comando `python3`), uv 0.13, Node 24, npm 11, pnpm 9.15, GNU Make 4.4 y Git. Con eso se ejecutan `make doctor`, `make check`, `make eval` y `make backend-check`.

En esta máquina, desde el 28 oct 2026, también están Temurin 21 y el Android SDK 35 (cmdline-tools, platform android-35, build-tools 35.0.0 y platform-tools). No viven en el repositorio. Sirven para compilar el shell de `apps/android` y para correr Keycloak local. No activan captura.

## Promovido a local-producción (2 nov 2026)

Ya no aplazados — corriendo user-space, sin admin ni Docker:

| Herramienta | Dónde | Estado |
|---|---|---|
| PostgreSQL 17.6 portable | `C:\Users\jesui\sovir-local\pg` + `pgdata`, :5432, db `sovir` | Instalado, migraciones `0001`–`0012` aplicadas, API :8787 corre contra él vía `DATABASE_URL`. Persistencia verificada tras restart |
| Keycloak 26.4.7 | `C:\Users\jesui\sovir-local\keycloak`, :8080 | Realm `sovir`, clients `sovir-extension` (PKCE, redirect `*.chromiumapp.org`) y `sovir-console` (redirect :3001), usuario `jesui`. JWT RS256 con claim `tenant_id`, verificado por `JwksIdentityVerifier` |
| Proveedor IA (Meta `muse-spark-1.3`) | `SOVIR_INFERENCE_URL` en `.env.local` | Verificado en vivo: hipótesis tipadas, reservas atómicas, refund en fallo, cap `SOVIR_INFERENCE_BUDGET_USD=5`. Egress real solo con `SOVIR_HTTP_EGRESS=real` + `SOVIR_ENV=local` + allowlist |

Arranque del stack: `C:\Users\jesui\sovir-local\start-sovir.ps1` (instalado en Startup del usuario — Task Scheduler denegado por política de la máquina). Keycloak corre `start-dev` con H2 en archivo: el realm persiste entre reinicios pero es almacén dev.

## Aplazado a propósito

| Herramienta | Qué es | Retomar cuando |
|---|---|---|
| Docker y Docker Compose | Ejecuta servicios locales en contenedores | Sigue sin instalarse — Postgres y Keycloak corren nativos portables. Vuelve si hace falta `infra/docker/compose.backend.dev.yml` |
| Android SDK (captura) | MediaProjection y captura de pantalla | El compilador está; lo aplazado es la captura, no el SDK |
| Xcode | Compila iOS y macOS nativos | Haya una máquina macOS. No se puede instalar en este Windows |
| Flutter | Marco multiplataforma que el comando `make doctor` solo reporta | No instalarlo. La decisión vigente es Kotlin y Swift nativos. Cambiarlo exige un ADR |
| Otros proveedores IA (Baseten backup, Modal, Fireworks) | Inferencia remota alternativa | Baseten ya está configurado como respaldo en `.env.local`. GPUs/Modal: solo con ticket y presupuesto (créditos Modal USD 100, ver `SPONSOR_CREDITS_2026-10-28.md`) |

`make doctor` puede mostrar `NOT_INSTALLED` en `xcodebuild`, `flutter` y `docker`. Eso es el estado esperado de esta tabla, no un fallo del scaffold.
