---
name: local-performance-profile
description: Mide en local el costo de las superficies de SOVIR (arranque, CPU, RAM, bundle y energía) en apps y packages/ui-web. Úsala al perfilar Android, iOS, escritorio, extensión, sitio o consola. No ejecuta benchmarks de pago ni edita CI.
---

# Perfil local de rendimiento

Rol: Cursor, mitad de cliente de `performance-profiler`. El perfil de CI y de jobs es la skill `ci-performance-profile` de Devin.

## Alcance

Medir `apps/android`, `apps/ios`, `apps/desktop`, `apps/extension`, `apps/website`, `apps/console` y `packages/ui-web`. No editar `infra/`, `.github/` ni `crates/sovir-inference`. No llamar a Meta, Baseten, Modal ni Fireworks.

## Pasos

1. Confirmar que la medición es local y sintética. Si falta dispositivo, emulador o build, escribir `NOT_MEASURED` y el motivo.
2. Registrar herramienta, hardware, duración y comando exacto. No inventar porcentajes de batería, FPS ni tokens.
3. Separar reposo, pasivo y activo. Un frame duplicado no justifica una inferencia remota.
4. Entregar cifras observadas y el hueco que queda sin medir. No optimizar borrando una alerta local de severidad alta.

## Salida

Tabla: superficie, escenario, métrica, valor observado o `NOT_MEASURED`, comando. Presupuesto de API: 0.
