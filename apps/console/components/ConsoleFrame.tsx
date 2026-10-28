import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { account, enterprise, operation } from "../lib/nav";
import { RailNav } from "./RailNav";

export async function requireDemoSession() {
  const jar = await cookies();
  const session = jar.get("sovir_demo_session")?.value;
  if (session !== "synthetic-demo" && session !== "developer-profile") {
    redirect("/sign-in");
  }
}

export async function ConsoleFrame({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  const jar = await cookies();
  const developer = jar.get("sovir_demo_session")?.value === "developer-profile";
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
          groups={[
            { label: "Operación", items: operation },
            { label: "Organización", items: enterprise },
            { label: "Cuenta", items: account },
          ]}
        />
        <div className="rail-foot">
          <span className="rail-avatar" aria-hidden="true">
            <span className="mark" />
          </span>
          <span className="rail-who">
            <strong>{developer ? "Desarrollador" : "Demo"}</strong>
            <small>Sesión local</small>
          </span>
          <form action="/api/session" method="post">
            <input type="hidden" name="intent" value="sign-out" />
            <button className="secondary" type="submit">
              Salir
            </button>
          </form>
        </div>
      </aside>
      <div className="workspace">
        <header className="console-top">
          <p className="banner">Datos sintéticos. Sin mensajes privados.</p>
          <ThemeSwitch />
        </header>
        <div className="main" id="contenido">
          {children}
        </div>
      </div>
    </div>
  );
}
