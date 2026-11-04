// OIDC client config for the console Authorization Code + PKCE flow.
// Enabled only when issuer+clientId are present — partial config means
// the IdP flow is off and dev-session remains the local path.
// For local Keycloak (infra/postgres docker-compose, profile `oidc`):
//   SOVIR_OIDC_ISSUER=http://127.0.0.1:8081/realms/sovir
//   SOVIR_OIDC_CLIENT_ID=sovir-console
//
// The redirect URI is derived from the request origin (x-forwarded-* aware)
// so the same deployment answers both http://127.0.0.1:3001 and the public
// funnel URL. SOVIR_OIDC_REDIRECT_URI remains as an explicit override.
export const OIDC_CALLBACK_PATH = "/bff/auth/oidc/callback";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri?: string;
  secure: boolean;
}

export function oidcConfig(origin?: string): OidcConfig | null {
  const issuer = process.env.SOVIR_OIDC_ISSUER;
  const clientId = process.env.SOVIR_OIDC_CLIENT_ID;
  if (!issuer || !clientId) return null;
  const redirectUri =
    process.env.SOVIR_OIDC_REDIRECT_URI ??
    (origin ? `${origin}${OIDC_CALLBACK_PATH}` : undefined);
  return {
    issuer: issuer.replace(/\/+$/, ""),
    clientId,
    redirectUri,
    secure: (redirectUri ?? "").startsWith("https://"),
  };
}

// Behind a TLS-terminating proxy (Tailscale Funnel) the request URL arrives
// as http:// but the browser-facing scheme is https — forwarded headers win.
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  return `${proto}://${host}`;
}
