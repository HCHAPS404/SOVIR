import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { enterprise, operation } from "../lib/nav";
import { toggleView } from "../lib/actions";
import { RailNav } from "./RailNav";

/// Presence check only — the token's validity is proven by the first
/// real API call (401 → ApiUnauthorized → redirect). The bearer lives in
/// an httpOnly cookie; it never reaches client components.
export async function requireApiSession() {
  const jar = await cookies();
  const token = jar.get("sovir_api_token")?.value;
  if (!token) redirect("/sign-in");
  return token;
}

export async function ConsoleFrame({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  const jar = await cookies();
  const principal = jar.get("sovir_api_principal")?.value ?? "desconocido";
  const view = jar.get("sovir_console_view")?.value === "dev" ? "dev" : "user";
  return (
    <div className="console">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="rail">
        <Link className="brand-lockup" href="/">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">SOVIR</span>
        </Link>
        <RailNav
          current={current}
          groups={
            view === "dev"
              ? [
                  { label: "Operación", items: operation },
                  { label: "Organización", items: enterprise },
                ]
              : [
                  { label: "Tu protección", items: operation },
                  { label: "Tu cuenta", items: enterprise },
                ]
          }
        />
        <div className="rail-foot">
          <span className="rail-avatar" aria-hidden="true">
            <span className="mark" />
          </span>
          <span className="rail-who">
            <strong>{principal}</strong>
            <small>{view === "dev" ? "Vista desarrollador" : "Vista usuario"}</small>
          </span>
          <div className="rail-actions">
            <form action={toggleView}>
              <button type="submit">
                {view === "dev" ? "Vista usuario" : "Vista dev"}
              </button>
            </form>
            <form action="/api/session" method="post">
              <input type="hidden" name="intent" value="sign-out" />
              <button type="submit">Salir</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="console-top">
          <p className="banner">
            {view === "dev"
              ? "API dev local · datos sintéticos, sin contenido privado."
              : "Modo demostración — todo es simulado y nada sale de tu máquina."}
          </p>
          <ThemeSwitch />
        </header>
        <div className="main" id="contenido">
          {children}
        </div>
      </div>
    </div>
  );
}
