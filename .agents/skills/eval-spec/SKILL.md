---
name: eval-spec
description: Escribe o revisa especificaciones de evaluación sintética de SOVIR para ChatGPT o Codex. Usarla en tests/fixtures, docs/ml o casos benignos, ambiguos y adversos. No ejecuta modelos ni informa precisión.
triggers:
  - user
---

# Especificación de evaluación

Esta skill pertenece a ChatGPT o Codex. Si el ejecutor es Devin, Cursor o Claude, detente. Claude ejecuta `threat-eval` y el código de ML.

## Alcance

Puedes editar especificaciones en `docs/ml` y definiciones sintéticas en `tests/fixtures`. No edites `crates/sovir-inference`, pipelines de entrenamiento ni proveedores.

## Pasos

1. Cada caso lleva id, escenario, clase permitida, comportamiento esperado y `data_policy: synthetic-only`.
2. Incluir al menos un caso benigno, uno ambiguo y uno adverso cuando el ticket pida una familia nueva. No usar capturas, conversaciones ni credenciales reales.
3. No entrenar con un falso positivo individual. No escribir precision, recall ni calibración: eso es `NOT_IMPLEMENTED` hasta que exista una corrida real.
4. Un enlace temporal no afirma identidad. La incertidumbre es un resultado válido.

## Salida

Casos tocados, clases cubiertas y la corrida de modelo que no se hizo.
