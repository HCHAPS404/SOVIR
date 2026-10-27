# SOVIR — Auditoría previa al primer commit

**Fecha:** 27 de octubre de 2026  
**Objeto:** `SOVIR_Fullstack_Integrated_Scaffold.zip` — versión auditada, sin prometer completitud de producto.

## Veredicto

- **APTO para inicializar un monorepo, abrirlo en Cursor y crear tickets de desarrollo.**
- **NO APTO como producto terminado, implementación multiplataforma operativa ni backend listo para producción.**
- **Compilación y tests Rust: sin verificar en el entorno de auditoría** (no había `cargo`/`rustc`).
- La prioridad al abrir Cursor es ejecutar el gate Rust, corregir formateo/compilación y generar `Cargo.lock` antes de la primera PR de backend.

## Resultados comprobados

| Validación | Resultado | Alcance real |
| --- | --- | --- |
| ZIP | PASA | Archivo legible; 126 archivos originales antes de añadir esta auditoría |
| JSON, TOML, YAML | PASA | Parsers sin errores de sintaxis |
| JSON Schema | PASA | Schema draft 2020-12 válido; fixture sintético conforme |
| `make doctor` | PASA | Detectó herramientas; **sin Rust/Cargo localmente** |
| `make check` | PASA | Documentación, Cursor rules y estructura básica |
| `make verify-architecture` | PASA | Guardas léxicas limitadas; **NO análisis AST completo** |
| `make eval` | PASA | 15 definiciones sintéticas válidas; **NO evaluaciones del modelo** |
| `make design-check` | PASA | Manifiesto y documentos; **NO pantallas ni accesibilidad runtime** |
| `make backend-scaffold-check` | PASA | Archivos, contratos y límites básicos; **NO compilación** |
| `make backend-check` | NO EJECUTADO | Requiere Rust y ahora **falla cerrado sin Cargo** |
| `cargo fmt/test/clippy` | NO EJECUTADO | Necesita toolchain Rust; no se afirma éxito |
| End-to-end e integraciones | NO IMPLEMENTADAS | No hay apps ejecutables ni adaptadores de producción |

## Hallazgos que NO debes confundir con producto implementado

1. `apps/android`, `apps/ios`, `apps/desktop`, `apps/website`, `apps/console`, `apps/extension` son **plantillas documentales** (sin manifiestos ni pantallas ejecutables).
2. El backend tiene **seis proyectos Cargo** y un API Axum local con repositorios en memoria; falta compilarlo y verificarlo en CI.
3. **Sin `Cargo.lock`** en el scaffold. Generarlo durante el primer build y versionarlo para binarios/servicios.
4. **Sin `CODEOWNERS` efectivo**: está pendiente de propietarios GitHub reales y protección de rama.
5. La autenticación es **token de desarrollo y loopback**. El consentimiento es una demostración lógica, no está ligado a identidades verificadas ni a permisos reales del SO.
6. **Sin persistencia real ni aislamiento de tenants**, migración SQL no conectada, sin cifrado operativo de datos de producción.
7. El resultado de riesgo usa `signals` enviados por el cliente de demostración. **No hay modelos validados, predicción adaptativa ni sensores conectados.**
8. `sovir-inference` implementa una reserva local de presupuesto, **todavía no enlazada a Meta, Baseten, Modal ni Fireworks**.
9. Los gates de diseño validan documentación; **Figma, branding aprobado, Storybook, pruebas visuales y tests de accesibilidad aún no están construidos**.
10. Los archivos `.github/workflows` están configurados; su **ejecución en GitHub no fue validada**. Los Rust fuente probablemente necesitarán `cargo fmt` antes del primer gate.

## Corrección realizada en la versión auditada

Antes `make test` podía finalizar correctamente sin `cargo`, informando `NOT_RUN`. Se cambió `make backend-check` para exigir Rust (`SOVIR_BACKEND_REQUIRE_RUST=1`) y se añadió `make backend-scaffold-check` para las verificaciones estáticas deliberadamente limitadas. Esto **impide confundir el check estático con compilación o pruebas Rust**.

## Primeros comandos al abrir Cursor

```bash
# Desde la raíz sovir_starter
make doctor
# Instalar Rust estable (rustup) si hace falta
cargo fmt --all
cargo generate-lockfile
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
make backend-check
make check
make eval
make design-check
```

Si `cargo fmt --all` modifica archivos, incluir el cambio en un commit dedicado de normalización y confirmar `cargo fmt --all -- --check`. No elevar CI a verde sin pruebas reales. Nunca subir `.env`, tokens de Meta/sponsors ni datos sensibles.

## Protocolo multiagente

1. **Un GitHub repo privado**: contiene documentación, `apps`, `crates`, `services`, `packages`, `infra`, CI y contratos. **Cursor es el editor local, no una nube especial para almacenar la arquitectura.**
2. Proteger `main`: no trabajar de manera concurrente en ella; usar **una rama corta por issue y una carpeta/worktree aislada por agente**.
3. ChatGPT: requisitos, ADR y auditorías; Claude: `crates/` y contratos; Cursor: `apps/`, sensores e integración; Devin: `infra/`, `scripts/`, CI. **La propiedad es por ticket y fichero, no exclusividad eterna.**
4. Flujo: issue + ADR si aplica → contrato versionado → implementación en ramas separadas → PR → checks + revisión cruzada → merge secuencial humano.
5. **Regla de precedencia**: decisiones humanas y contratos aprobados > ADRs aceptados > README > reglas agent-specific > sugerencias de agentes. Cuando hay conflicto, abrir una revisión; jamás cambiar los contratos silenciosamente.
6. Para el backend, **habilitar una PR temprana de normalización Cargo** antes de que todos dependan del workspace.

## Criterio de aceptación del bootstrap (no del producto)

- `cargo fmt --all -- --check`, `cargo test --workspace` y Clippy verdes en CI.
- OpenAPI, JSON Schema y tipos Rust verificados con pruebas de contrato (no solo sintaxis).
- `Cargo.lock` comprometido; secretos fuera de Git y protección de ramas configurada.
- Issue tracker con owners, responsabilidades y primer conjunto de tickets.
- Pantallas y APIs futuras siguen etiquetadas como `PLANNED` hasta su implementación real.
