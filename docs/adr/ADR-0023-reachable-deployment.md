# ADR-0023 — Despliegue alcanzable: exposición privada controlada

Estado: propuesto (pendiente signoff del maintainer)
Fecha: 2026-11-02

## Contexto

El stack hoy está diseñado como dev-local: `sovir-api` se niega a bindear fuera
de loopback, dev-session solo vive en `SOVIR_ENV ∈ {local,test}` y el egress
real se apaga fuera de esos entornos. El usuario necesita acceder al dashboard
y al API desde otros dispositivos (móvil, otra máquina) sin abrir el servicio a
Internet público.

## Decisión

**Exposición privada, no pública.** El despliegue alcanzable es una interfaz de
red privada (LAN doméstica u overlay tipo Tailscale/WireGuard), con hardening
obligatorio. Internet público queda explícitamente fuera de alcance hasta que la
checklist de la sección "No alcanzable aún" se complete con evidencia.

Fase A (implementable ahora, este ADR):

1. **`SOVIR_BIND_ADDR`** — dirección de bind explícita. Hoy cualquier no-loopback
   aborta el arranque; con esta env el bind se permite SOLO si además se cumple
   `SOVIR_DEPLOY=private-overlay`. Sin ambas, el guard loopback sigue intacto.
2. **`SOVIR_DEPLOY=private-overlay`** — puerta maestra de despliegue alcanzable:
   - dev-session **deshabilitado** (401 en `/v1/dev/session`) — solo OIDC real.
   - JWKS fetch y egress remoto siguen permitidos (son salientes, no entrantes).
   - El bind acepta la IP explícita de `SOVIR_BIND_ADDR` o `0.0.0.0` — nunca
     implícito por omisión.
   - Log de arranque imprime bind + modo, para auditoría.
3. Consola Next.js se expone con `next start -H 0.0.0.0` bajo el mismo flag en
   `start-sovir.ps1` (comentado por defecto).
4. TLS entre dispositivos queda a cargo del overlay (Tailscale ya cifra). En LAN
   plana el tráfico es claro — se documenta como limitación aceptada local.

Fase B (solo declarada, NO implementada): exposición a Internet público.

## No alcanzable aún (checklist que bloquea Fase B)

- TLS terminado en el API (rustls/caddy reverse proxy) — hoy todo es HTTP claro.
- Rate limiting por IP y anti-enumeración en `/v1/*`.
- Provisioning real de tenants (hoy `tenant_id` es self-declared/claim simple).
- Gestión de secretos fuera de `.env.local` (rotación, no-plaintext).
- Headers de seguridad en consola (CSP, HSTS) y revisión de cookies `Secure`.
- Auditoría de acceso agregada por origen remoto + alertas de anomalía.
- Eval de adversarios contra el endpoint expuesto (fixture adversarial suite).

## Consecuencias

- Positivo: el usuario prueba desde móvil/otra máquina sin tocar el modelo de
  amenaza; dev-session muerto en modo deploy elimina el bypass de identidad.
- Riesgo: en LAN plana sin overlay, credenciales OIDC viajan en claro — mitigado
  exigiendo `SOVIR_DEPLOY` consciente y documentando la limitación.
- Los guards existentes se RELAJAN de forma explícita, no se eliminan: sin las
  dos envs el comportamiento es idéntico a hoy (fail closed loopback).

## Verificación

- `SOVIR_DEPLOY=private-overlay SOVIR_BIND_ADDR=0.0.0.0` → API bindea, dev-session
  responde 401, `/health/ready` OK desde otra máquina del overlay.
- Sin las envs → bind no-loopback sigue abortando (test de regresión).
- `harness.py check` + suite adapters/application sin regresiones.
