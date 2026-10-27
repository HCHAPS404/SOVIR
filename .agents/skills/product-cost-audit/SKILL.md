---
name: product-cost-audit
description: Revisa hipótesis de costo, cupos y presupuesto de inferencia de SOVIR para ChatGPT o Codex. Usarla en docs de economía, presupuestos o sponsors. No llama a proveedores ni enciende inferencia remota.
triggers:
  - user
---

# Auditoría de costo de producto

Esta skill pertenece a ChatGPT o Codex. Si el ejecutor es Devin, Cursor o Claude, detente. Claude conserva `cost-audit` sobre el código de inferencia.

## Alcance

Leer `README.md`, `docs/operations` y notas de presupuesto. No editar adaptadores, claves ni workflows. No llamar a Meta, Baseten, Modal ni Fireworks.

## Pasos

1. Etiquetar cada cifra como tarifa documentada, ejemplo ilustrativo o hipótesis. No convertir el ejemplo del README en pronóstico.
2. Comprobar que agotar el cupo remoto no apaga las reglas locales.
3. Dejar los créditos de sponsors como condicionales hasta que el maintainer confirme el saldo.
4. Presupuesto de esta revisión: 0 tokens de proveedor.

## Salida

Tabla: concepto, fuente, clasificación, hueco sin medir. Sin recomendación de activar un proveedor.
