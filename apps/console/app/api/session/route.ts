import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function POST(request: Request) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "sign-in");
  const jar = await cookies();
  if (intent === "sign-out") {
    jar.delete("sovir_demo_session");
    redirect("/sign-in");
  }
  jar.set("sovir_demo_session", "synthetic-demo", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
  redirect("/");
}
