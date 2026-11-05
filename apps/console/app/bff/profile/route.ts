import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Cosmetic display-name override: the profile panel posts here; the cookie
// only changes how the console greets the user — identity stays the OIDC
// `sub` / dev principal. Photo upload lives client-side (localStorage) —
// there is no avatar storage in the API by design.
export async function POST(request: Request) {
  const form = await request.formData();
  const name = String(form.get("display_name") ?? "")
    .trim()
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .slice(0, 40);
  if (name) {
    const jar = await cookies();
    jar.set("sovir_display_name", name, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  redirect("/perfil");
}
