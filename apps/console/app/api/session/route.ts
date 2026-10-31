import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiDown, devSession, logout } from "../../../lib/api";

// Real session mint against the dev API. The bearer token is stored in an
// httpOnly cookie — server components attach it server-side; the browser
// never sees it. Two synthetic profiles mint different principals so
// tenant/principal scoping is exercisable from the UI.
export async function POST(request: Request) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "sign-in");
  const jar = await cookies();

  if (intent === "sign-out") {
    const token = jar.get("sovir_api_token")?.value;
    if (token) await logout(token);
    jar.delete("sovir_api_token");
    jar.delete("sovir_api_principal");
    redirect("/sign-in");
  }

  const principal = intent === "developer" ? "console-dev" : "console-demo";
  try {
    const session = await devSession(principal, "console-web");
    const opts = { httpOnly: true, sameSite: "lax" as const, secure: false, path: "/" };
    jar.set("sovir_api_token", session.token, opts);
    jar.set("sovir_api_principal", session.principal_id, opts);
  } catch (e) {
    if (e instanceof ApiDown) redirect("/sign-in?error=backend");
    redirect("/sign-in?error=session");
  }
  redirect("/");
}
