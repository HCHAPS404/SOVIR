import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ApiDown, ApiUnauthorized } from "./api";

// Fetch wrapper for page loads: 401 means the session token died server-
// side (expired/revoked/API restarted with in-memory state) → re-auth;
// unreachable API → null so pages render the honest "sin conexión" state
// instead of crashing.
export async function live<T>(fn: (token: string) => Promise<T>): Promise<T | null> {
  const jar = await cookies();
  const token = jar.get("sovir_api_token")?.value;
  if (!token) redirect("/sign-in");
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof ApiUnauthorized) redirect("/sign-in?error=session");
    if (e instanceof ApiDown) return null;
    throw e;
  }
}
