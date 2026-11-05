import { redirect } from "next/navigation";
import { oidcConfig } from "../../lib/oidc";

// Registration is hosted by the IdP (Keycloak). When OIDC is configured the
// public `/registro` link jumps straight to the account-creation form — no
// intermediate portal. Without OIDC, dev-session sign-in stays the local path.
export default function RegistroPage() {
  redirect(oidcConfig() ? "/bff/auth/oidc/register" : "/sign-in");
}
