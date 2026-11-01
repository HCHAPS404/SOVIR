import { cookies } from "next/headers";

export type ConsoleView = "user" | "dev";

// Default is the user view: plain-language surfaces only. The developer
// view additionally shows technical identifiers, scopes and raw details.
export async function getView(): Promise<ConsoleView> {
  const jar = await cookies();
  return jar.get("sovir_console_view")?.value === "dev" ? "dev" : "user";
}
