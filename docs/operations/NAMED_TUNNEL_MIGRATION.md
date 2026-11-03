# Migración quick tunnels → named tunnel (Opción B)

Runbook para pasar de las URLs rotativas `*.trycloudflare.com` a
hostnames fijos sobre dominio propio. **Bloqueado hoy**: no hay dominio.
Este doc es la preparación — no ejecutar hasta tener el dominio en
Cloudflare DNS. Contexto y seguridad: `CLOUDFLARE_TUNNEL.md`.

## Inventario de servicios

| Servicio | Puerto | Hostname sugerido | Clientes |
|---|---|---|---|
| `apps/website` (landing) | 3000 | `www.<dominio>` | público general |
| `apps/console` (dashboard) | 3001 | `console.<dominio>` | navegadores auth |
| API (`services/api`) | 8787 | `api.<dominio>` | extensión + Android |
| Keycloak | 8080 | `auth.<dominio>` | todos (OIDC) |

## Pasos

### 1. Crear el túnel (una vez)

```powershell
cloudflared tunnel login
cloudflared tunnel create sovir
cloudflared tunnel route dns sovir www.<dominio>
cloudflared tunnel route dns sovir console.<dominio>
cloudflared tunnel route dns sovir api.<dominio>
cloudflared tunnel route dns sovir auth.<dominio>
```

### 2. Config

Copiar `infra/cloudflared/config.yml.example` →
`%USERPROFILE%\.cloudflared\config.yml` y reemplazar `<tunnel-id>` +
`<dominio>`. Validar: `cloudflared tunnel ingress validate`.

### 3. Realineamiento OIDC (el paso que rompe todo si se olvida)

Con `hostname-strict false`, Keycloak estampa en `iss` el host del token
endpoint. Toda la cadena debe usar `auth.<dominio>`:

| Donde | Cambio |
|---|---|
| `.env.local` (API) | `SOVIR_OIDC_ISSUER=https://auth.<dominio>/realms/sovir` — `SOVIR_OIDC_JWKS_URL` queda loopback |
| `apps/console/.env.local` | mismo issuer + `SOVIR_OIDC_REDIRECT_URI=https://console.<dominio>/api/auth/oidc/callback` |
| `apps/website/.env.local` | `NEXT_PUBLIC_SOVIR_CONSOLE_URL=https://console.<dominio>` |
| Keycloak → client `sovir-console` | `redirectUris` += `https://console.<dominio>/api/auth/oidc/callback`; `webOrigins` += `https://console.<dominio>` |
| Keycloak → client `sovir-extension` | `redirectUris` += `app.sovir.android://oauth` (ya está) — sin cambios |

Reiniciar API y consola tras los cambios de env.

### 4. Clientes

- **Android**: *Cuenta → Cambiar servidor* →
  `api.<dominio>` + `auth.<dominio>/realms/sovir/protocol/openid-connect/token`.
  La sesión se cierra sola (los tokens son del issuer anterior — correcto).
  O rebuild: `gradlew assembleDebug -PSOVIR_API_BASE=... -PSOVIR_OIDC_TOKEN_URL=...`
- **Extensión**: `apiBase` en options/storage apunta a
  `https://api.<dominio>` — mismo mecanismo de override, sin rebuild.
- **`start-tunnels.ps1`**: reemplazar los 4 `cloudflared tunnel --url`
  por un solo `cloudflared tunnel run sovir`; `tunnels.json` pasa a ser
  estático (las URLs ya no rotan — actualizarlo una vez y olvidar).

### 5. Verificación (antes de declararlo vivo)

```powershell
curl https://api.<dominio>/v1/health          # 401/200 según ruta — vivo
curl https://auth.<dominio>/realms/sovir      # JSON del realm
curl https://www.<dominio>                    # landing 200
curl https://console.<dominio>                # 307 → sign-in
```

Luego extremo a extremo: sign-in en la consola remota → evento de la
extensión → visible en el dashboard; login Android → evento del
observador → mismo dashboard.

### 6. Seguridad (antes de abrir auth.<dominio>)

- Cambiar `admin/admin_local_only` del realm master **antes** de exponer
  Keycloak a internet.
- Cloudflare Access (Zero Trust, gratis ≤50 usuarios): policy por email
  delante de `console.` y `auth.` — defensa en profundidad sin código.
- La landing queda pública por diseño; el API ya exige Bearer OIDC.

## Rollback

`cloudflared tunnel run` no toca los quick tunnels. Volver =
re-lanzar `start-tunnels.ps1` (versión quick), tomar las nuevas URLs de
`tunnels.json` y rehacer el realineamiento OIDC del §3 hacia el nuevo
issuer. Los tokens del named tunnel quedan inválidos — re-login.

## Lo que NO cambia

- `SOVIR_PRIVATE_OVERLAY` / bind loopback: cloudflared sale hacia
  Cloudflare desde `127.0.0.1`; nada escucha en la LAN.
- Contratos: las URLs son configuración, no parte del contrato — nada en
  `packages/contracts` se toca.
- Tokens emitidos con el issuer anterior: inválidos por diseño; el
  re-login los renueva.
