import { cookies } from "next/headers";

export type ConsoleView = "user" | "dev";

// Default is the user view: plain-language surfaces only. The developer
// view additionally shows technical identifiers, scopes and raw details.
// Admins (SOVIR_ADMIN_PRINCIPALS on the API, surfaced via whoami.is_admin)
// land in the dev view by default — the cookie still overrides either way.
export async function getView(admin?: boolean): Promise<ConsoleView> {
  const jar = await cookies();
  const explicit = jar.get("sovir_console_view")?.value;
  if (explicit === "dev" || explicit === "user") return explicit;
  return admin ? "dev" : "user";
}
