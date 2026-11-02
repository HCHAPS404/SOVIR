import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { oidcConfig } from "../../../../../lib/oidc";

// OIDC Authorization Code + PKCE callback. Verifies the state cookie,
// exchanges the code for tokens at the IdP token endpoint and stores the
// access token as the console's API bearer (httpOnly cookie — the API
// verifies it against the realm JWKS). On any failure we fail closed
// back to sign-in; no token ever reaches the browser JS context.
export async function GET(request: Request) {
  const cfg = oidcConfig();
  if (!cfg) return new Response("OIDC not configured", { status: 404 });

  const url = new URL(request.url);
  const jar = await cookies();
  const expectedState = jar.get("sovir_oidc_state")?.value;
  const verifier = jar.get("sovir_oidc_verifier")?.value;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const fail = (reason: string) => {
    for (const k of ["sovir_oidc_verifier", "sovir_oidc_state", "sovir_oidc_nonce"]) {
      jar.delete(k);
    }
    redirect(`/sign-in?error=${reason}`);
  };

  if (error || !code) return fail("oidc_denied");
  if (!expectedState || !verifier || state !== expectedState) return fail("oidc_state");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code,
    code_verifier: verifier,
  });
  const tokenRes = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null);
  if (!tokenRes || !tokenRes.ok) return fail("oidc_exchange");

  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return fail("oidc_token");

  for (const k of ["sovir_oidc_verifier", "sovir_oidc_state", "sovir_oidc_nonce"]) {
    jar.delete(k);
  }
  jar.set("sovir_api_token", tokens.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.secure,
    path: "/",
  });
  redirect("/");
}
