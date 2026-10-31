# Consola — arquitectura de información

Estado: mapa. No hay aplicación autenticada. La consola no comparte cookies ni despliegue con el sitio público.

## Personal

`Overview`, `Protections`, `Incidents`, `Investigations`, `Devices`, `Permissions`, `Resource Intelligence`, `Account`.

## Empresa

`Policies`, `Aggregates`, `Integrations`, `Audit`, `Billing`.

Un administrador no ve conversaciones privadas ni un perfil de ánimo. Los agregados salen con umbral de privacidad.

## Lectura de una pantalla

Cada vista distingue observado, inferido, verificado y desconocido. Los estados vacíos, sin permiso, sin conexión, con cobertura limitada y revocado se diseñan junto con el caso principal. Un panel sin eventos no se rotula como protegido.

Los patrones compartidos ya nombrados están en `packages/design-system/component-contracts.json`: `RiskEvidenceCard`, `ConsentScopePicker`, `InvestigationTimeline`, `ResourceUsagePanel`, `PlatformCoverage`, `PrivacyControl`.
