# ADR-0004 — Separación operativa entre la web de marketing y la consola autenticada
**Status:** PROPOSED.

## Decisión
`apps/website`: marketing público, documentación, SEO, privacidad, distribución, sin acceso a datos de protección. `apps/console`: autenticación y trabajo personal/empresarial, `no-store` para recursos sensibles. Ambos comparten `packages/design-system` y `packages/ui-web` y una identidad visual consistente. Despliegues y subdominios distintos, navegación unificada; no obligamos a un usuario a visitar marketing para usar la app. OIDC/OAuth2 PKCE según cliente y evaluación del backend; cookies sólo en contextos seguros.

## Justificación
Evitar que marketing y telemetría comprometan consola, bundles inmanejables, sitemap de rutas privadas y conflictos de cookies. Facilitar campañas/editorial sin desestabilizar decisiones operativas.

## Verificación
CSP distinta por app, test de noindex/auth, rutas públicas, enlaces login/logout, sesiones seguras, web vitals, ausencia de PII en tracker, snapshots responsive y a11y.
