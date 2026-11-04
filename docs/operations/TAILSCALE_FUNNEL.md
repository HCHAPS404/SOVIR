# Tailscale Funnel — URL pública estable (reemplaza quick tunnels)

Estado: ACTIVO desde 2026-11-03. Reemplaza los quick tunnels de Cloudflare
(URLs `*.trycloudflare.com` efímeras que morían cada reinicio).

## URL estable

**`https://hell.taile32c7d.ts.net`** — estable mientras la máquina `hell`
permanezca en el tailnet (sobrevive reinicios, cambios de IP, meses).

| Path | Backend |
|---|---|
| `/` | Consola web → `127.0.0.1:3001` |
| `/api` | API → `127.0.0.1:8787` (el proxy recorta el prefijo — el API ve `/v1/…`) |
| `/sso` | Keycloak → `127.0.0.1:8080` |
| `/web` | Website pública → `127.0.0.1:3000` |

Base URLs para clientes: extension/Android usan `https://hell.taile32c7d.ts.net/api`.

## Cómo se montó (pasos reales, con trampas)

1. `winget install Tailscale.Tailscale` → servicio `tailscaled` automático.
2. `tailscale up` → el usuario firma en `login.tailscale.com/a/…` (identidad).
3. Serve requiere habilitarlo en el tailnet: `login.tailscale.com/f/serve?node=…`.
4. Mounts por path — **trampa Git Bash**: `/api` se convierte en
   `C:/Program Files/Git/api`. Exportar `MSYS_NO_PATHCONV=1` primero:

   ```bash
   export MSYS_NO_PATHCONV=1
   tailscale serve --bg --set-path=/    http://127.0.0.1:3001
   tailscale serve --bg --set-path=/api http://127.0.0.1:8787
   tailscale serve --bg --set-path=/sso http://127.0.0.1:8080
   tailscale serve --bg --set-path=/web http://127.0.0.1:3000
   ```

5. `tailscale funnel --bg --set-path=/ http://127.0.0.1:3001` — activa la
   exposición pública del host completo (todos los Handlers).
6. `tailscale funnel status` debe mostrar `(Funnel on)`.

## Invariantes

- La URL es **pública** — la auth vive en el API (dev-session/OIDC), no en
  el hostname. No tratar la URL como secreto.
- Funciona solo con el PC encendido y `tailscaled` corriendo.
- `SOVIR_OIDC_ISSUER` en `.env.local` = `https://hell.taile32c7d.ts.net/sso/realms/sovir`
  (estable); `SOVIR_OIDC_JWKS_URL` sigue loopback `127.0.0.1:8080`.
- Extensión: para uso remoto, apuntar `api-url` en options + el grant de
  host lo pide Chrome en ese momento (`optional_host_permissions` ya cubre
  `https://*/*` — no requiere rebuild).

## Límites honestos

- Funnel (beta): sin SLA; para producción real, named tunnel con dominio
  propio sigue siendo la vía documentada (`NAMED_TUNNEL_MIGRATION.md`).

## Auth por el funnel (resuelto 2026-11-03)

- **Issuer fijado**: Keycloak arranca con
  `--hostname=https://hell.taile32c7d.ts.net/sso` (en `start-sovir.ps1`);
  el `iss` es el público en ambos accesos (local y funnel) → una sola
  identidad. `restart-keycloak.ps1` en `sovir-local/` aplica el restart.
- **Consola `/api` → `/bff`**: las rutas internas de Next.js se movieron
  fuera de `/api` porque ese prefijo del funnel pertenece al backend.
  Login OIDC: `/bff/auth/oidc/{login,callback}`; session/lang/export igual.
- **Redirect URI derivada del request** (`lib/oidc.ts::requestOrigin`) —
  x-forwarded aware; sirve `127.0.0.1:3001` y el funnel sin env fijo.
- **Realm**: `sovir-console` tiene callbacks `/bff/...` (funnel + local);
  `sovir-extension` incluye `app.sovir.android://oauth` para el PKCE móvil.
