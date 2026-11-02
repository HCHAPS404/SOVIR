import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { emitSequencePair, toggleView } from "../lib/actions";
import { exportData } from "../lib/api";
import { getLocale, stringsFor } from "../lib/i18n";
import { live } from "../lib/live";
import { enterprise, operation } from "../lib/nav";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RailNav } from "./RailNav";

const DEV_PAGE_NAMES: Record<string, string> = {
  "/": "Panel general",
  "/incidents": "Incidentes e intervenciones",
  "/investigations": "Investigaciones e inferencia",
  "/devices": "Dispositivos vinculados",
  "/permissions": "Permisos y gobernanza",
  "/enterprise/audit": "Auditoría inmutable",
};

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
  const nick = principal.replace(/^console-/, "");
  const view = jar.get("sovir_console_view")?.value === "dev" ? "dev" : "user";
  const dev = view === "dev";
  const locale = await getLocale();
  const s = stringsFor(locale);
  const data = await live(exportData);
  const now = Date.now();

  const activeGrants = data
    ? data.grants.filter((g) => !g.revoked && g.expires_at_ms > now).length
    : 0;
  const activeDevices = data ? data.devices.filter((d) => !d.revoked_at_ms).length : 0;
  const totalInterventions = data ? data.interventions.length : 0;
  const pendingInterventions = data
    ? data.interventions.filter((i) => i.state === "pending").length
    : 0;
  const totalEvents = data ? data.events.length : 0;
  const totalAudit = data ? data.audit_events.length : 0;

  // In simple user view, only show the 4 everyday sections with friendly labels.
  const userPageNames: Record<string, string> = {
    "/": s.nav.summary,
    "/incidents": s.nav.alerts,
    "/investigations": s.nav.investigations,
    "/devices": s.nav.myDevices,
    "/permissions": s.nav.privacy,
    "/enterprise/audit": s.nav.audit,
  };
  const userItems = [
    { href: "/", label: s.nav.summary },
    {
      href: "/incidents",
      label: s.nav.alerts,
      badge: totalInterventions > 0 ? totalInterventions : undefined,
    },
    { href: "/devices", label: s.nav.myDevices },
    { href: "/permissions", label: s.nav.privacy },
  ];

  // In technical dev view, expose all operational and diagnostic surfaces.
  const devBadgeFor = (href: string): number | string | undefined => {
    if (!data) return undefined;
    if (href === "/incidents") return totalInterventions;
    if (href === "/investigations") return "LAB";
    if (href === "/devices") return activeDevices;
    if (href === "/permissions") return activeGrants;
    if (href === "/enterprise/audit") return totalAudit;
    return undefined;
  };

  const opItems = operation.map((item) => ({ ...item, badge: devBadgeFor(item.href) }));
  const entItems = enterprise.map((item) => ({ ...item, badge: devBadgeFor(item.href) }));

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
            <small>{dev ? "Control Center · Dev" : s.signin.title}</small>
          </span>
          <i
            className={`dot dot--${data ? "success" : "danger"}`}
            style={{ marginLeft: "auto" }}
            title={data ? "Protección activa" : "Sin conexión"}
          />
        </Link>

        <RailNav
          current={current}
          groups={
            dev
              ? [
                  { label: "Operación", items: opItems },
                  { label: "Gobernanza", items: entItems },
                ]
              : [{ label: "Menú principal", items: userItems }]
          }
        />

        {dev ? (
          <div className="rail-group">
            <h2>Estado epistémico</h2>
            <ul className="rail-cats">
              <li>
                <i className="cat-sq cat-sq--amber" aria-hidden="true" />
                <span>Alertas pendientes</span>
                <code>{pendingInterventions}</code>
              </li>
              <li>
                <i className="cat-sq cat-sq--slate" aria-hidden="true" />
                <span>Señales observadas</span>
                <code>{totalEvents}</code>
              </li>
              <li>
                <i className="cat-sq cat-sq--sage" aria-hidden="true" />
                <span>Permisos vigentes</span>
                <code>{activeGrants}</code>
              </li>
              <li>
                <i className="cat-sq cat-sq--brand" aria-hidden="true" />
                <span>Inferencia</span>
                <code>LOCAL</code>
              </li>
            </ul>
          </div>
        ) : null}

        <div className="rail-callout">
          <div className="rail-callout-head">
            <span>
              <i className="dot dot--success" aria-hidden="true" />{" "}
              {dev ? "Modo privado activo" : "¿Para qué sirve SOVIR?"}
            </span>
            {dev ? <span className="ep-badge">$0 egress</span> : null}
          </div>
          <p>
            {dev
              ? "Todo el análisis ocurre en tu equipo. Lanza una secuencia de prueba para verificar el motor."
              : s.overview.sub}
          </p>
          <form action={emitSequencePair}>
            <button type="submit">
              {dev ? "+ Simular estafa (gancho→pago)" : s.overview.testButton}
            </button>
          </form>
        </div>

        <div className="rail-foot">
          <span className="rail-avatar" aria-hidden="true">
            <span className="mark" />
          </span>
          <span className="rail-who">
            <strong>{dev ? principal : nick}</strong>
            <small>{dev ? s.nav.techView : s.signin.title}</small>
          </span>
          <form action="/api/session" method="post">
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
            <strong>
              {dev
                ? (DEV_PAGE_NAMES[current] ?? "Consola")
                : (userPageNames[current] ?? s.nav.summary)}
            </strong>
          </div>
          <div className="top-tools">
            <LanguageSwitcher current={locale} label={s.nav.language} />
            <form action={toggleView} className="seg-pill" aria-label="Cambiar nivel de detalle">
              <button type="submit" className={!dev ? "is-active" : ""}>
                {s.nav.simpleView}
              </button>
              <button type="submit" className={dev ? "is-active" : ""}>
                {s.nav.techView}
              </button>
            </form>
            <ThemeSwitch />
          </div>
        </header>

        {dev ? (
          <div className="ticker-strip" role="status" aria-label="Telemetría operativa">
            <span className="ticker-item">
              <i className={`dot dot--${data ? "success" : "danger"}`} aria-hidden="true" />
              <b>Motor</b>
              <strong>{data ? "Política dev-1 activa" : "API desconectada"}</strong>
            </span>
            <span className="ticker-div" aria-hidden="true" />
            <span className="ticker-item">
              <b>Egress HTTP</b>
              <strong>Bloqueado (record · $0.00)</strong>
            </span>
            <span className="ticker-div" aria-hidden="true" />
            <span className="ticker-item">
              <b>Inferencia</b>
              <strong>sovir-heuristic-local-0.2</strong>
            </span>
            <span className="ticker-div" aria-hidden="true" />
            <span className="ticker-item">
              <b>Permisos</b>
              <strong>{activeGrants} vigentes</strong>
            </span>
            <span className="ticker-div" aria-hidden="true" />
            <span className="ticker-item">
              <b>Alertas</b>
              <strong>
                {totalInterventions} ({pendingInterventions} pendientes)
              </strong>
            </span>
          </div>
        ) : null}

        <div className="main" id="contenido">
          {children}
        </div>
      </div>
    </div>
  );
}
