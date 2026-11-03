# Cloudflare Tunnel — móvil y web alcanzan el API local (ADR-0023)

Por qué Tunnel y no VPS/Render: el cerebro (concilio, ONNX 641MB,
Postgres, Keycloak) queda en tu PC — local-first intacto, $0/mes.
`cloudflared` expone `https://api.<tudominio>` → `127.0.0.1:8787` con
TLS gestionado por Cloudflare. El móvil y la consola en Vercel lo
alcanzan desde cualquier red sin abrir puertos ni mover datos fuera.

Esto resuelve "mi móvil me alcanza por internet". **No** es Fase B
(multi-tenant público): ese sigue siendo checklist aparte.

## Requisitos

- Dominio en Cloudflare (el plan gratis basta; traslada el DNS de un
  dominio que tengas o compra uno ~$10/año)
- `winget install --id Cloudflare.cloudflared`

## Setup (una vez, ~10 min)

```powershell
cloudflared tunnel login                      # abre browser, eliges dominio
cloudflared tunnel create sovir-api
cloudflared tunnel route dns sovir-api api.<tudominio>
```

`%USERPROFILE%\.cloudflared\<tunnel-id>.json` queda creado. Config
`%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: C:\Users\jesui\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: api.<tudominio>
    service: http://127.0.0.1:8787
  - hostname: auth.<tudominio>
    service: http://127.0.0.1:8080   # Keycloak — login real del móvil
  - service: http_status:404
```

```powershell
cloudflared tunnel route dns sovir-api auth.<tudominio>
cloudflared service install          # arranca con Windows
```

## Seguridad mínima (antes de abrir)

1. El API ya exige Bearer OIDC — el tunnel solo añade TLS, no abre auth.
2. Keycloak tras el tunnel: realm `sovir` con usuarios fuertes; cambia
   `local_only` antes de exponer `auth.<tudominio>`.
3. Recomendado: Cloudflare Access (Zero Trust, gratis ≤50 usuarios) —
   policy "solo mi email" delante de ambos hostnames. Defensa en
   profundidad sin tocar código.
4. `SOVIR_PRIVATE_OVERLAY` sigue permitiendo el bind loopback — el
   tunnel se conecta a `127.0.0.1`, nada escucha en la LAN pública.

## Conectar el móvil

Rebuild APK con las URLs públicas:

```powershell
cd apps\android
.\gradlew.bat assembleDebug `
  -PSOVIR_API_BASE=https://api.<tudominio> `
  -PSOVIR_OIDC_TOKEN_URL=https://auth.<tudominio>/realms/sovir/protocol/openid-connect/token
```

Cleartext traffic ya no aplica (https). En la app: login con tu usuario
Keycloak → el observador emite eventos + assess con veredicto del
concilio, notificación local incluida, desde cualquier red.

## Consola en Vercel (opcional)

`apps/console` → `vercel deploy`. Env vars: `NEXT_PUBLIC_API_BASE=https://api.<tudominio>`,
`OIDC_ISSUER=https://auth.<tudominio>/realms/sovir`, redirect URI del
client `sovir-console` en Keycloak apuntando al dominio Vercel.
