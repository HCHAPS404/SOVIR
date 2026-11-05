import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { oidcConfig, requestOrigin } from "../../../../../lib/oidc";
import { createHash, randomBytes } from "node:crypto";

// Same PKCE flow as /bff/auth/oidc/login but lands on the IdP's
// registrations endpoint — "Crear cuenta" jumps straight to the
// account-creation form instead of the login form.
const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function GET(request: Request) {
  const cfg = oidcConfig(requestOrigin(request));
  if (!cfg?.redirectUri) return new Response("OIDC not configured", { status: 404 });

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  const nonce = b64url(randomBytes(16));

  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cfg.secure,
    path: "/",
    maxAge: 600,
  };
  jar.set("sovir_oidc_verifier", verifier, opts);
  jar.set("sovir_oidc_state", state, opts);
  jar.set("sovir_oidc_nonce", nonce, opts);

  const url = new URL(`${cfg.issuer}/protocol/openid-connect/registrations`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  redirect(url.toString());
}
