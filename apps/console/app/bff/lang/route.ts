import { NextRequest, NextResponse } from "next/server";
import { LOCALES, type Locale } from "../../../lib/i18n";

// Persists the user's explicit UI-language choice. The cookie only holds a
// locale tag — never user data — and beats Accept-Language on next visit.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { lang?: string; next?: string };
  if (!body.lang || !LOCALES.includes(body.lang as Locale)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sovir_lang", body.lang, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
