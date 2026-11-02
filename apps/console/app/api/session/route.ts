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

  // Any typed name mints its own isolated principal (console-<name>) so each
  // user keeps separate consents, events, devices and audit across sessions.
  const raw = String(form.get("principal") ?? "");
  const name = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  if (!name) redirect("/sign-in?error=name");
  const principal = `console-${name}`;
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
