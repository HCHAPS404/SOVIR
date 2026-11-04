import { cookies } from "next/headers";

export type ConsoleView = "user" | "dev";

// Single production console: every principal sees the same plain-language
// surfaces. The former developer view is retired — the product detects real
// events; it does not ship simulation or lab affordances in the dashboard.
export async function getView(_admin?: boolean): Promise<ConsoleView> {
  return "user";
}
