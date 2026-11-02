// OIDC client config for the console Authorization Code + PKCE flow.
// Enabled only when ALL three variables are present — partial config
// means the IdP flow is off and dev-session remains the local path.
// For local Keycloak (infra/postgres docker-compose, profile `oidc`):
//   SOVIR_OIDC_ISSUER=http://127.0.0.1:8081/realms/sovir
//   SOVIR_OIDC_CLIENT_ID=sovir-console
//   SOVIR_OIDC_REDIRECT_URI=http://127.0.0.1:3001/api/auth/oidc/callback
export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  secure: boolean;
}

export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.SOVIR_OIDC_ISSUER;
  const clientId = process.env.SOVIR_OIDC_CLIENT_ID;
  const redirectUri = process.env.SOVIR_OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !redirectUri) return null;
  return {
    issuer: issuer.replace(/\/+$/, ""),
    clientId,
    redirectUri,
    secure: redirectUri.startsWith("https://"),
  };
}
