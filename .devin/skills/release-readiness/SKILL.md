---
name: release-readiness
description: Revisa si un tag candidato de SOVIR tiene CI, secretos, disclosures y empaquetado sin publicar tiendas ni producción. Usarla antes de un release. No firma, no despliega y no sustituye la aprobación humana.
triggers:
  - user
  - model
---

# Preparación de release

Rol: Devin, con cierre humano. Esta skill comprueba; no publica.

## Alcance

Leer CI, `SECURITY.md`, empaquetado y notas del tag. Puedes corregir un workflow o un script del ticket. No edites políticas de consentimiento, dominio ni identidad de marca.

## Pasos

1. Confirmar CI verde del commit candidato y repetir el comando que falte. Si no se puede correr, `NOT_RUN`.
2. Buscar secretos, capturas reales y PII en el diff y en los artifacts.
3. No afirmar firma, notarización, SBOM o publicación en tienda si el archivo no existe.
4. Comprobar que la API de desarrollo sigue en loopback y que la inferencia remota permanece apagada.
5. Entregar la lista al maintainer. No hacer merge, tag ni deploy.

## Salida

Checklist con hecho, evidencia o pendiente. Nada de «listo para producción» sin la firma humana.
