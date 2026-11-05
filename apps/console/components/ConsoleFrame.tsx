import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { exportData } from "../lib/api";
import { getLocale, stringsFor } from "../lib/i18n";
import { live } from "../lib/live";
import { AvatarBadge } from "./AvatarBadge";
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
  const nick = jar.get("sovir_display_name")?.value ?? principal.replace(/^console-/, "");
  const locale = await getLocale();
  const s = stringsFor(locale);
  const data = await live(exportData);
  const totalInterventions = data ? data.interventions.length : 0;

  const pageNames: Record<string, string> = {
    "/": s.nav.summary,
    "/incidents": s.nav.alerts,
    "/devices": s.nav.myDevices,
    "/permissions": s.nav.privacy,
    "/enterprise/audit": s.nav.audit,
    "/perfil": s.profile.title,
  };
  const items = [
    { href: "/", label: s.nav.summary },
    {
      href: "/incidents",
      label: s.nav.alerts,
      badge: totalInterventions > 0 ? totalInterventions : undefined,
    },
    { href: "/devices", label: s.nav.myDevices },
    { href: "/permissions", label: s.nav.privacy },
    { href: "/enterprise/audit", label: s.nav.audit },
  ];

  return (
    <div className="console">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="rail">
        <Link className="rail-brand" href="/">
          <span className="rail-brand-box" aria-hidden="true">
            <span className="mark" />
          </span>
          <span className="rail-brand-text">
            <strong>SOVIR</strong>
            <small>{s.signin.title}</small>
          </span>
          <i
            className={`dot dot--${data ? "success" : "danger"}`}
            style={{ marginLeft: "auto" }}
            title={data ? "Protección activa" : "Sin conexión"}
          />
        </Link>

        <RailNav current={current} groups={[{ label: "Menú principal", items }]} />

        <div className="rail-callout">
          <div className="rail-callout-head">
            <span>
              <i className="dot dot--success" aria-hidden="true" /> {s.overview.howKicker}
            </span>
          </div>
          <p>{s.overview.sub}</p>
        </div>

        <div className="rail-foot">
          <Link className="rail-profile" href="/perfil" title={s.profile.title}>
            <AvatarBadge name={nick} />
            <span className="rail-who">
              <strong>{nick}</strong>
              <small>{s.profile.kicker}</small>
            </span>
          </Link>
          <form action="/bff/session" method="post">
            <input type="hidden" name="intent" value="sign-out" />
            <button className="ghost" type="submit">
              {s.nav.signOut}
            </button>
          </form>
        </div>
      </aside>

      <div className="workspace">
        <header className="console-top">
          <div className="top-crumb">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 11.2 12 4.5l8 6.7V20H4v-8.8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>SOVIR</span>
            <span className="sep">/</span>
            <strong>{pageNames[current] ?? s.nav.summary}</strong>
          </div>
          <div className="top-tools">
            <ThemeSwitch />
          </div>
        </header>

        <div className="main" id="contenido">
          {children}
        </div>
      </div>
    </div>
  );
}
