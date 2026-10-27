import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { enterprise, personal } from "../lib/nav";

export async function requireDemoSession() {
  const jar = await cookies();
  if (jar.get("sovir_demo_session")?.value !== "synthetic-demo") {
    redirect("/sign-in");
  }
}

export function ConsoleFrame({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
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
        <ThemeSwitch />
        <p className="kicker">Demo sintética</p>
        <h2>Personal</h2>
        <nav aria-label="Personal">
          {personal.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <h2>Empresa</h2>
        <nav aria-label="Empresa">
          {enterprise.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/session" method="post">
          <input type="hidden" name="intent" value="sign-out" />
          <button className="secondary" type="submit">
            Cerrar sesión demo
          </button>
        </form>
      </aside>
      <div className="main" id="contenido">
        <p className="banner">Datos sintéticos. Sin mensajes privados.</p>
        {children}
      </div>
    </div>
  );
}
