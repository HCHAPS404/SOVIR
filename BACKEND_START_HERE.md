# SOVIR — Backend scaffold listo para integrar

Este paquete **complementa, no reemplaza** el scaffold de frontend/Figma. Su monorepo único mantiene `apps/`, `design/`, `docs/design/`, `.cursor/`, `.claude/`, etc.

## Qué está implementado hoy

- `Cargo.toml` workspace con seis paquetes y bibliotecas Rust de dominio, puertos, aplicación, adaptadores, presupuestos e interfaz HTTP.
- API de desarrollo Axum `127.0.0.1:8787`, protegida por token local de entorno, que valida consentimiento, rechaza datos secretos, no admite referencias a capturas crudas, evita eventos duplicados y respeta revocaciones.
- Evaluador de riesgos **determinista de demostración**, basado en señales tipadas no confiables. No es un detector de fraudes entrenado o validado.
- Gobernador en memoria de reservas de presupuesto con límites diarios y por petición. Ningún proveedor real de IA se conecta por defecto.
- Contratos JSON Schema y OpenAPI de desarrollo, migración PostgreSQL propuesta, CI de Rust, scripts y pruebas de dominio y casos de uso.

## Archivos para consultar primero

1. `README.md` — visión general del producto y arquitectura.
2. `docs/backend/BACKEND_MASTER_PLAN.md` — contratos, dominios, riesgos, costes, ownership, roadmap y decisiones.
3. `docs/operations/BACKEND_BOOTSTRAP.md` — pasos y comandos locales.
4. `docs/adr/ADR-0005-backend-loopback-first.md` — decisión del bootstrap seguro.
5. `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/60-backend.mdc`.
6. `docs/operations/DEFERRED_TOOLCHAINS.md` — herramientas que no se instalan en el arranque y el hito en el que vuelven.

## Comandos

```bash
# Desde sovir_starter/ con Rust estable instalado:
make backend-check
# servidor local, en una terminal con token secreto generado:
export SOVIR_API_DEV_TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"
make backend-run
# segunda terminal, con la misma variable exportada:
make backend-smoke
```

**No uses esta API por Internet.** Carece todavía de autenticación multiusuario, aislamiento de tenants, almacenamiento seguro persistente, autorización sobre capturas reales y validación de modelos. Se limita a eventos sintéticos y metadatos. El servidor rechaza binds no loopback y remoto-IA=true.

## Estado de pruebas al entregar

- Verificaciones estáticas de estructura y esquemas: **aprobadas**.
- Harness de escenarios sintéticos y diseño heredados: **aprobados**.
- Parseo de manifiestos Cargo: **aprobado**.
- `cargo fmt`, `cargo test`, `cargo clippy`, smoke HTTP: **NO EJECUTADOS**, no hay toolchain Rust en el entorno de preparación. Ejecutar localmente/CI y corregir si hay errores.
- Backend real con proveedor Meta / PostgreSQL / sensores OS: **NO IMPLEMENTADO**.

## Cómo integrarlo

**Opción recomendada:** descarga el ZIP fullstack integrado y úsalo como la carpeta del proyecto en Cursor. No hace falta colocar dos ZIPs uno sobre otro.

**Si ya tienes el scaffold del frontend en un repositorio y contiene cambios tuyos:** usa el ZIP backend-only como parche; crea una rama `feat/backend-foundation-<issue>`, revisa el diff y fusiona archivo por archivo. No sobrescribas a ciegas la carpeta que hayas modificado.

El nombre SOVIR sigue siendo de trabajo y la identidad visual sigue pendiente de aprobación humana.
