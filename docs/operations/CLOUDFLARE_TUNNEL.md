# Cloudflare Tunnel — móvil y web alcanzan el API local (ADR-0023)

Por qué Tunnel y no VPS/Render: el cerebro (concilio, ONNX 641MB,
Postgres, Keycloak) queda en tu PC — local-first intacto, $0/mes.
`cloudflared` expone `https://api.<tudominio>` → `127.0.0.1:8787` con
TLS gestionado por Cloudflare. El móvil y la consola en Vercel lo
alcanzan desde cualquier red sin abrir puertos ni mover datos fuera.

Esto resuelve "mi móvil me alcanza por internet". **No** es Fase B
(multi-tenant público): ese sigue siendo checklist aparte.

## Opción A — quick tunnels SIN dominio (operativa hoy)

`cloudflared tunnel --url http://127.0.0.1:8787` publica un subdominio
aleatorio `*.trycloudflare.com` — accesible desde cualquier plataforma,
TLS incluido, sin cuenta ni dominio. Es lo que corre ahora mismo:

- `start-tunnels.ps1` (en `~/sovir-local/`): mata procesos viejos, lanza
  ambos túneles (api :8787 + auth :8080) detached, extrae las URLs del
  log y las deja en `~/sovir-local/tunnels.json`.
- `Startup/sovir-tunnels.cmd`: los levanta en cada inicio de sesión.
- **Limitación honesta**: si cloudflared o el PC se reinician, la URL
  cambia. La app se repunta sin recompilar: *Cuenta → Cambiar servidor*
  (lee `tunnels.json` para las URLs nuevas; la sesión se cierra porque
  los tokens son del emisor anterior).
- El APK se compila con los defaults apuntando al túnel vigente:
  `gradlew assembleDebug -PSOVIR_API_BASE=<url> -PSOVIR_OIDC_TOKEN_URL=<url>/realms/sovir/protocol/openid-connect/token`

Cuando exista dominio propio, la Opción B reemplaza esto sin tocar la
app (mismo override de servidor, ahora a URLs fijas).

## Opción B — named tunnel con dominio propio (permanente)

### Requisitos

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

## Quick tunnels: alineacion OIDC (verificado 2026-11-03)

Con `start-dev --hostname-strict false`, Keycloak estampa en `iss` el
HOST del token endpoint que emitio el token. Toda la cadena debe usar el
mismo issuer o el API rechaza el JWT (`validation.set_issuer`):

- `.env.local` (repo): `SOVIR_OIDC_ISSUER=<auth-tunnel>/realms/sovir`.
  `SOVIR_OIDC_JWKS_URL` queda loopback — las claves no dependen del host.
- `apps/console/.env.local`: mismo issuer de tunel +
  `SOVIR_OIDC_REDIRECT_URI=<console-tunnel>/api/auth/oidc/callback`.
- Keycloak client `sovir-console`: registrar el callback del tunel en
  `redirectUris` y el origen en `webOrigins` (admin API,
  `admin/admin_local_only` en master).
- Android: token endpoint del tunel (horneado o via Cuenta > Cambiar
  servidor) — mismo `iss`.

Si la URL del tunel de auth rota: actualizar issuer en ambos `.env.local`
+ reiniciar API y consola + repoint en la app. Si rota la de consola:
re-registrar el callback en Keycloak y actualizar `REDIRECT_URI`.

Health real del tunel = `curl https://<url>/health/ready` publico, no
`tasklist`: cloudflared puede seguir vivo con el origen roto (HTTP 530).
`start-tunnels.ps1` lanza los tres (api/auth/console) y escribe
`~/sovir-local/tunnels.json` con las URLs activas.
