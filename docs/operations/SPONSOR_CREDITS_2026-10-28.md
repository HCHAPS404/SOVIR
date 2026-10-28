# SOVIR — Registro operativo de créditos de sponsors

**Fecha:** 2026-10-28 · **Estado:** declaración del responsable y cifras informativas; no contiene credenciales ni consulta automática de balances.

## Crédito Modal

| Campo | Estado documentado |
|---|---|
| Sponsor | Modal |
| Crédito otorgado | **USD 100** |
| Activación | **CONFIRMADA por el responsable de SOVIR** |
| Vigencia | **Durante la competencia**, según el responsable |
| Fecha exacta de caducidad del crédito | **PENDIENTE de verificar en el panel y términos individuales de Modal** |
| Plazo operativo de planificación | Presentar y terminar los trabajos antes del cierre de entregas indicado para el hackathon: **2026-11-04**; no asumir que la expiración técnica ocurre exactamente esa fecha/hora |
| Saldo actual | Desconocido aquí: USD 100 otorgados **no equivale** a USD 100 remanentes |
| Propiedad del acceso | Exclusiva del responsable humano; nunca subir tokens/keys a GitHub |

### Uso autorizado

- Modal sirve para trabajos **GPU/serverless bajo demanda**, evals de modelos, procesamiento de datasets sintéticos/redactados, benchmarking y pruebas puntuales con costo controlado.
- **Devin** configura infraestructura, jobs, ejecución acotada, etiquetas, apagado automático y lectura de consumo; **Claude** implementa evaluadores, experimentos de ML y validación de resultados; **ChatGPT** especifica benchmarks, trade-offs, auditoría de gastos y criterios de continuación. **Cursor** no consume crédito de backend salvo ticket aprobado por el maintainer.
- **Control de costos obligatorio:** presupuesto por job, límite máximo diario, alertas del dashboard, timeout, concurrencia máxima, idempotencia, cancelación y limpieza. Detener inmediatamente workers que queden activos. No almacenar datos de usuarios reales como datasets para experimentos.
- Los tests de PR/CI no deben requerir Modal ni otra API paga. No interpretar una simulación sin GPU como prueba de modelo real.
- **Criterio FinOps:** registrar por experimento `issue`, dueño, modelo, duración, tipo de GPU, costo previsto, costo real, objetivo y resultado; no ejecutar si no hay presupuesto validado.

### Presupuesto propuesto (no ejecutado)

| Reserva Modal | Objetivo |
|---:|---|
| USD 55 | Evaluación y comparación de modelos con datos sintéticos |
| USD 25 | Optimización de latencia, memoria y costo GPU |
| USD 20 | Contingencia y demostración final |

Las reservas son límites **internos propuestos**, no cuotas impuestas por Modal; el maintainer debe aprobarlas. El gasto puede no corresponder exactamente al crédito según SKU, región, restricciones o cambios de tarifa.

## Otros sponsors: no confundir disponibilidad con anuncio

| Plataforma | Oferta descrita en documentación del proyecto | Situación confirmada en esta conversación |
|---|---:|---|
| Meta Model API | USD 150 informados para SOVIR | El responsable los mencionó; saldo/activación exacta por comprobar en su panel |
| Baseten | USD 100 ofertados a seleccionados | Activación no confirmada aquí |
| Fireworks AI | USD 25 ofertados a seleccionados | Activación no confirmada aquí |
| Modal | USD 100 ofertados a seleccionados | **USD 100 otorgados, confirmado por el responsable** |

**No asumir** que los restantes créditos vencen en la misma fecha ni que los cuatro son transferibles a producción. Verificar panel, periodo exacto, restricciones de uso y saldos antes de gastar. Las cotizaciones, límites y elegibilidad se registran sin secretos en issues/PRs.

## Registro de decisión

- El propietario indicó que los créditos de Modal duran lo que dure la competencia.
- Se documenta como **dato confirmado por el propietario, no verificación independiente de los términos individuales**.
- Cualquier cambio de proveedor debe conservar el patrón de arquitectura hexagonal, el adaptador `InferenceGateway`, política de datos, contabilidad y límites de gasto.
- Este archivo es documental y se presenta en PR; no habilita cuentas, créditos, servicios, facturación ni merge.
