---
name: ui-quality-audit
description: Revisa interfaz profesional, accesibilidad, desempeño y diseño anti AI slop.
---

- Inspeccionar estados normal/error/empty/offline/permission denied, flujo de usuario, jerarquía y tipografía, microcopy, fuentes y licencias.
- Verificar que `observed`, `inferred`, `verified`, `unknown` no se confundan; nunca protección activa falsa.
- Probar a11y WCAG 2.2 AA en web + adaptaciones OS; pantalla estrecha/alto contraste/reduced motion/teclado.
- Comparar con Figma aprobado y snapshots. No usar valores visuales inventados para ocultar datos faltantes.
- Entregar tabla de defectos: P0 seguridad/engaño; P1 inaccesibilidad o bloqueo de tarea; P2 consistencia; P3 detalle.
