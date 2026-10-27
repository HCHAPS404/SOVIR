---
name: product-architecture-review
description: Revisa propuestas de arquitectura, ADR y límites de contexto de SOVIR para el rol de producto de ChatGPT o Codex. Usarla al escribir o revisar docs/adr, docs/architecture o docs/product. No edita Rust, apps ni infraestructura.
triggers:
  - user
---

# Revisión de arquitectura de producto

Esta skill pertenece a ChatGPT o Codex. Si el ejecutor es Devin, Cursor o Claude, detente y no la apliques; cada uno tiene sus propios procedimientos.

## Alcance

Leer y proponer cambios en `docs/adr`, `docs/architecture` y `docs/product`. No editar `crates/`, `apps/`, `services/`, `infra/` ni `packages/contracts`.

## Pasos

1. Leer `AGENTS.md`, el README y los ADR ya aceptados. Una propuesta no reabre una invariante de consentimiento.
2. Separar hecho, decisión, hipótesis y restricción. No declarar una capacidad como implementada.
3. Si el cambio exige otro contrato, sensor o proveedor, escribir la propuesta y detenerse hasta revisión humana y de Claude.
4. No asumir acceso al repositorio remoto ni fusionar.

## Salida

Hallazgos con ruta, severidad y la decisión humana que falta. Sin plan de implementación dentro de crates o apps.
