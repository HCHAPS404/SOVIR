import { redirect } from "next/navigation";

// Registration is hosted by the IdP (Keycloak), reached through the
// sign-in screen's OIDC flow. This route keeps the public `/registro`
// link stable without duplicating an account-creation form here.
export default function RegistroPage() {
  redirect("/sign-in");
}
