---
name: api-contract-check
description: Compara diffs de OpenAPI y JSON Schema de SOVIR y señala roturas de compatibilidad. Usarla en cambios de packages/contracts o de fixtures de prueba. No redefine el significado de consentimiento ni edita el dominio.
triggers:
  - user
  - model
---

# Comprobación de contrato de API

Rol: Devin. Claude es dueño del significado del contrato. Tú compruebas el diff y la compatibilidad, no inventas campos de negocio.

## Alcance

Leer `packages/contracts`, `tests/contracts` y `tests/fixtures`. Puedes proponer un ajuste de fixture sintético. No edites `crates/sovir-domain`, `crates/sovir-application` ni la semántica de `consent_grant_id`.

## Pasos

1. Leer el diff del esquema y del OpenAPI. Clasificar cada cambio como compatible o rompedor.
2. Comprobar que los fixtures siguen siendo `synthetic-only` y que no aparece captura, secreto ni PII.
3. Si el cambio rompe consentimiento, eventos o evaluación, detenerte y pedir el contrato a Claude.
4. No levantar la API en una interfaz pública ni llamar a un proveedor.

## Salida

Lista: archivo, cambio, compatible o rompedor, fixture afectado, comando ejecutado. Lo no ejecutado queda como `NOT_RUN`.
