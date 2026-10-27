---
name: ci-performance-profile
description: Prepara o revisa el perfil de rendimiento en CI, scripts y tests/performance de SOVIR, sin llamadas de pago. Usarla en .github, scripts o benchmarks de infraestructura. No reescribe las apps ni mide un dispositivo que no existe.
triggers:
  - user
  - model
---

# Perfil de rendimiento en CI

Rol: Devin, mitad de infraestructura de `performance-profiler`. La medición en el cliente es la skill `local-performance-profile` de Cursor.

## Alcance

`/.github/workflows`, `scripts/` y `tests/performance`. No edites `apps/` ni `crates/sovir-domain`. `make benchmark` sigue negándose a gastar API si no hay presupuesto explícito del maintainer.

## Pasos

1. Revisar que el job sea manual o esté acotado, sin secretos y sin contenido de pantalla.
2. No lanzar Meta, Baseten, Modal, Fireworks ni una GPU de pago.
3. Si no hay runner ni hardware, el resultado es `NOT_IMPLEMENTED`, no un número estimado.
4. Un cambio de umbral de CI no debilita las pruebas de consentimiento ni de formato Rust.

## Salida

Job, comando, costo esperado (0 salvo presupuesto escrito), evidencia y huecos `NOT_MEASURED`.
