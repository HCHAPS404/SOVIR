# SOVIR — Registro de ampliación de ramas del backend

- **Fecha:** 2026-10-28.
- **Repositorio:** https://github.com/HCHAPS404/SOVIR
- **Cambio autorizado:** crear las 14 ramas B8–B21 y registrar su alcance junto a B1–B7.
- **Estado:** creación de referencias Git verificada. La documentación se propone mediante un Pull Request independiente. **No** implica que los módulos estén implementados.
- **Punto de partida exacto:** `84ebf5581538c68d515e34e2e1493cd4f496c53d` (compartido con B1–B7 y `feat/design-foundations-dx01`).
- **`main` al comenzar:** `526604937d66566f38f879419b5eaa9e15348f8c` (fundación aún no integrada).

## Operaciones realizadas

| ID | Rama Git creada | Resultado |
|---|---|---|
| B8 | `feat/backend-identity-b8` | Creada y verificada |
| B9 | `feat/backend-devices-b9` | Creada y verificada |
| B10 | `feat/backend-ingestion-b10` | Creada y verificada |
| B11 | `feat/backend-edge-runtime-b11` | Creada y verificada |
| B12 | `feat/backend-context-graph-b12` | Creada y verificada |
| B13 | `feat/backend-threat-detection-b13` | Creada y verificada |
| B14 | `feat/backend-predictive-ml-b14` | Creada y verificada |
| B15 | `feat/backend-intervention-b15` | Creada y verificada |
| B16 | `feat/backend-data-governance-b16` | Creada y verificada |
| B17 | `feat/backend-security-b17` | Creada y verificada |
| B18 | `feat/backend-threat-intelligence-b18` | Creada y verificada |
| B19 | `feat/backend-enterprise-b19` | Creada y verificada |
| B20 | `feat/backend-integrations-b20` | Creada y verificada |
| B21 | `infra/backend-platform-b21` | Creada y verificada |

**B1–B7 se preservaron sin cambios:** `feat/backend-consent-b1`, `feat/backend-evidence-b2`, `feat/backend-policy-b3`, `feat/backend-inference-b4`, `feat/backend-research-b5`, `feat/backend-sync-b6`, `feat/backend-billing-b7`.

## Límites de esta operación

- Se crearon ramas, pero **no** commits de código en B8–B21.
- Se actualizó `docs/operations/BRANCHES.md` en la rama documental `docs/backend-branch-map-b1-b21` para reflejar los 21 dominios, prioridades y ownership propuestos.
- No se fusionó a `main`, no se desplegaron servicios, ni se cambiaron permisos, secretos, credenciales o configuraciones de producción.
- Las ramas B1–B21 son **reservas organizativas**, no ramas permanentes obligatorias. Cada trabajo debe ejecutarse en PRs acotados y con CI, partiendo de una fundación compartida aprobada.
- El cambio de `main` requiere revisión humana. La fundación debe incorporarse a `main` mediante su propio PR antes de iniciar cambios paralelos dependientes de ella.

## Criterios de validación

1. Existen exactamente los 21 nombres B1–B21 en remoto (además de `main` y ramas de frontend/documentación).
2. Las 14 ramas nuevas apuntan al punto de partida declarado y no tienen código individual.
3. El archivo `docs/operations/BRANCHES.md` tiene tabla de dominios, separación entre observación/riesgo/política/intervención e indicaciones de integración.
4. Se puede inspeccionar esta constancia mediante el PR de documentación sin alterar `main`.

## Próximas acciones recomendadas

1. Revisar y aprobar el PR documental.
2. Integrar a `main` la fundación compartida tras revisión técnica, CI y auditoría de archivos.
3. Abrir issues por corte vertical con contrato, responsable, ownership y pruebas.
4. Rebasar o recrear ramas de ejecución desde `main` actualizado **sin force-push** sobre ramas con contribuciones no integradas.
5. Revisar compatibilidad en CI antes de incorporar código.

_Este registro documenta cambios de Git y decisiones de planificación, no el estado de preparación para producción de SOVIR._
