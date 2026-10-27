# Toolchains aplazadas

**Estado:** recordatorio activo. Aprobado por el maintainer el 27 de octubre de 2026.  
**No es una lista olvidada:** cualquier trabajo que dependa de una fila de esta tabla debe volver aquí antes de instalar o de afirmar que el entorno está listo.

## Instalado para el arranque

Rust stable, `rustfmt`, `clippy`, Python 3.12 (comando `python3`), uv 0.13, Node 24, npm 11, pnpm 9.15, GNU Make 4.4 y Git. Con eso se ejecutan `make doctor`, `make check`, `make eval` y `make backend-check`.

## Aplazado a propósito

| Herramienta | Qué es | Retomar cuando |
|---|---|---|
| Docker y Docker Compose | Ejecuta servicios locales en contenedores, incluido Postgres de desarrollo | Se salga de la API en memoria y haga falta `infra/docker/compose.backend.dev.yml` |
| PostgreSQL | Base de datos multiusuario prevista para la nube | Haya ticket de persistencia, cuentas o auditoría. La migración `infra/postgres/migrations/0001_initial.sql` sigue siendo propuesta |
| Java y Android SDK | Compilan la app Android nativa (Kotlin, Compose) | Empiece el hito de Screen Seeker en Android. Hoy `apps/android` es solo documentación |
| Xcode | Compila iOS y macOS nativos | Haya una máquina macOS. No se puede instalar en este Windows |
| Flutter | Marco multiplataforma que el comando `make doctor` solo reporta | No instalarlo. La decisión vigente es Kotlin y Swift nativos. Cambiarlo exige un ADR |
| Proveedores de IA (Meta, Baseten, Modal, Fireworks) y sus créditos | Inferencia remota y cómputo de experimento | El núcleo local esté verificado y haya presupuesto, allowlist y modo Standard. Por defecto no hay llamadas remotas |

`make doctor` puede mostrar `NOT_INSTALLED` en `java`, `xcodebuild`, `flutter` y `docker`. Eso es el estado esperado de esta tabla, no un fallo del scaffold.
