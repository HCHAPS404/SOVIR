import Link from "next/link";
import type { Principal, PrincipalDataExport } from "../lib/api";
import {
  connectThisDeviceAction,
  dispatchInterventionsAction,
  emitSequencePair,
  emitUiTreeObservation,
  mintLabConsent,
} from "../lib/actions";
import {
  dailyBuckets,
  dailyLabeledBuckets,
  recentActivity,
  timeAgo,
  trendDelta,
  weeklyDigest,
} from "../lib/digest";
import { getView } from "../lib/view";
import { Sparkline } from "./Sparkline";

const tips = [
  {
    q: "Si algo exige que actúes YA",
    a: "Cuenta bloqueada, premio, multa, paquete retenido — la prisa fabricada es la herramienta favorita del estafador. Párate y verifica por otro canal.",
  },
  {
    q: "Primero el miedo, después el cobro",
    a: "El patrón clásico de la estafa: te presionan con urgencia y justo después aparece la solicitud de pago. SOVIR detecta esa secuencia como gancho→pago.",
  },
  {
    q: "Verifica quién te pide",
    a: "Los impostores usan nombres parecidos a tu banco o servicios reales. Un permiso concedido al observador no autoriza a nadie más a pedirte datos.",
  },
  {
    q: "Diseños que empujan a equivocarte",
    a: "Botones que esconden el “rechazar”, colores que destacan el “aceptar”, casillas premarcadas. SOVIR los detecta como patrones oscuros de consentimiento.",
  },
] as const;

const CAT_COLORS = ["amber", "copper", "plum", "slate", "sage", "brand"] as const;

function SegBar({
  active,
  total = 8,
  tone = "amber",
}: {
  active: number;
  total?: number;
  tone?: "amber" | "sage" | "copper" | "brand";
}) {
  return (
    <span className={`seg-bar seg-bar--${tone}`} aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <i key={i} className={i < active ? "is-on" : ""} />
      ))}
    </span>
  );
}

export async function OverviewBoard({
  me,
  data,
  version,
  backendDown,
}: {
  me: Principal | null;
  data: PrincipalDataExport | null;
  version: { version: string; contract: string; build_sha: string } | null;
  backendDown: boolean;
}) {
  const view = await getView();
  const dev = view === "dev";
  const now = Date.now();
  const digest = data ? weeklyDigest(data, now) : null;
  const feed = data ? recentActivity(data, 8) : [];
  const nick = me?.principal_id.replace(/^console-/, "") ?? "usuario";

  const activityTrend = digest
    ? trendDelta(
        digest.protectedCount + digest.signalCount,
        digest.prevProtectedCount + digest.prevSignalCount,
      )
    : null;

  const allTimestamps = data
    ? data.events
        .map((e) => e.observed_at_ms)
        .concat(data.interventions.map((i) => i.created_at_ms))
    : [];
  const dayBars = dailyLabeledBuckets(allTimestamps, 7, now);
  const peakDay = dayBars.find((d) => d.isPeak) ?? dayBars[dayBars.length - 1];

  const activeGrants = data
    ? data.grants.filter((g) => !g.revoked && g.expires_at_ms > now).length
    : 0;
  const activeDevices = data ? data.devices.filter((d) => !d.revoked_at_ms).length : 0;
  const pendingAlerts = data
    ? data.interventions.filter((i) => i.state === "pending").length
    : 0;

  return (
    <div className="desk">
      <header className="page-head">
        <div className="page-head-title">
          <p className="live-kicker">
            <i className={`dot dot--${backendDown ? "danger" : "success"}`} aria-hidden="true" />
            {backendDown
              ? "Motor desconectado"
              : digest?.lastActivityAt
                ? `Última actividad ${timeAgo(digest.lastActivityAt, now)}`
                : "Motor activo · esperando primeras señales"}
          </p>
          <h1>{dev ? `Consola Operativa · ${me?.principal_id ?? ""}` : `Hola de nuevo, ${nick}`}</h1>
          <p className="page-head-sub">
            {dev
              ? `Sesión autenticada en tenant "${me?.tenant_id ?? "dev"}" · API v${version?.version ?? "0.1"} (${version?.contract ?? "v1"}) · Egress en modo record ($0.00).`
              : "Resumen verificable de tu protección, señales analizadas en local y controles de respuesta inmediata."}
          </p>
        </div>
        <div className="head-actions">
          <div className="seg-pill" aria-label="Ventana de análisis">
            <span className="is-active">7 días</span>
            <span>24 horas</span>
            <span>Tiempo real</span>
          </div>
          <form action={emitSequencePair}>
            <button className="btn-op btn-op--primary" type="submit">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {dev ? "Emitir par gancho→pago" : "Simular estafa"}
            </button>
          </form>
          <Link className="btn-op" href="/investigations">
            Investigaciones →
          </Link>
        </div>
      </header>

      {backendDown || !data || !digest ? (
        <section className="panel" aria-label="Sin conexión">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Estado del servicio</p>
              <h2>Sin conexión con la API local</h2>
              <p>
                La API dev no responde en <code>127.0.0.1:8787</code>. Arranca{" "}
                <code>cargo run -p sovir-api</code> y recarga la página.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* ROW 1 — 4 Rich Feature KPI Cards */}
          <div className="kpi-grid">
            <section className="kpi-card kpi-card--amber" aria-label="Alertas de protección">
              <div className="kpi-top">
                <div className="kpi-brand">
                  <span className="kpi-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M12 3.5 19 6.4v5.2c0 4-2.7 6.9-7 8.4-4.3-1.5-7-4.4-7-8.4V6.4L12 3.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="kpi-titles">
                    <small>Protección 7D</small>
                    <strong>Alertas emitidas</strong>
                  </span>
                </div>
                <span className="ep-badge ep-badge--policy">Política dev-1</span>
              </div>
              <div className="kpi-mid">
                <p className="kpi-num">{digest.protectedCount}</p>
                {activityTrend ? (
                  <span className={`trend trend--${activityTrend.tone}`}>
                    {activityTrend.label}
                  </span>
                ) : (
                  <span className="ep-badge">{pendingAlerts} pendientes</span>
                )}
              </div>
              <Sparkline
                values={dailyBuckets(
                  data.interventions.map((i) => i.created_at_ms),
                  7,
                  now,
                )}
              />
              <div className="kpi-foot">
                <span>
                  {digest.lastAlertAt
                    ? `Última alerta ${timeAgo(digest.lastAlertAt, now)}`
                    : "Sin alertas esta semana"}
                </span>
                <Link href="/incidents">Ver cola →</Link>
              </div>
            </section>

            <section className="kpi-card kpi-card--slate" aria-label="Señales observadas">
              <div className="kpi-top">
                <div className="kpi-brand">
                  <span className="kpi-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M4 12h4l2.5-6 4 12 2.5-6H20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="kpi-titles">
                    <small>Telemetría local</small>
                    <strong>Señales analizadas</strong>
                  </span>
                </div>
                <span className="ep-badge ep-badge--observed">Observado</span>
              </div>
              <div className="kpi-mid">
                <p className="kpi-num">{digest.signalCount}</p>
                <span className="ep-badge">{data.events.length} históricas</span>
              </div>
              <Sparkline
                values={dailyBuckets(
                  data.events.map((e) => e.observed_at_ms),
                  7,
                  now,
                )}
              />
              <div className="kpi-foot">
                <span>{digest.categories.length} categorías detectadas</span>
                <Link href="/investigations">Barrer ventana →</Link>
              </div>
            </section>

            <section className="kpi-card kpi-card--sage" aria-label="Cobertura de permisos">
              <div className="kpi-top">
                <div className="kpi-brand">
                  <span className="kpi-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M8 11V8.2a4 4 0 0 1 8 0V11M7 11h10v8H7v-8Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="kpi-titles">
                    <small>Consentimiento</small>
                    <strong>Fuentes activas</strong>
                  </span>
                </div>
                <span className="ep-badge ep-badge--verified">Revocable</span>
              </div>
              <div className="kpi-mid">
                <p className="kpi-num">{activeGrants}</p>
                <span className="ep-badge">{data.grants.length} registradas</span>
              </div>
              <SegBar active={Math.min(8, activeGrants * 4)} total={8} tone="sage" />
              <div className="kpi-foot">
                <span>
                  {activeGrants > 0
                    ? "Ingesta autorizada con validación"
                    : "Fail-closed: sin permisos activos"}
                </span>
                <Link href="/permissions">Gestionar →</Link>
              </div>
            </section>

            <section className="kpi-card" aria-label="Dispositivos y aislamiento">
              <div className="kpi-top">
                <div className="kpi-brand">
                  <span className="kpi-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M4 6h16v10H4V6Zm5 13h6m-3-3v3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="kpi-titles">
                    <small>Superficies</small>
                    <strong>Equipos vinculados</strong>
                  </span>
                </div>
                <span className="ep-badge">Aislado</span>
              </div>
              <div className="kpi-mid">
                <p className="kpi-num">{activeDevices}</p>
                <span className="ep-badge">{data.audit_events.length} trazas</span>
              </div>
              <SegBar active={Math.min(8, Math.max(2, activeDevices * 4))} total={8} tone="brand" />
              <div className="kpi-foot">
                <span>Principal: {me?.principal_id}</span>
                <Link href="/devices">Equipos →</Link>
              </div>
            </section>
          </div>

          {/* ROW 2 — Main Analytical Bento: 7-Day Vertical Bar Chart + Threat Breakdown & Lab */}
          <div className="bento-asym">
            <section className="panel" aria-label="Actividad de los últimos 7 días">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Cadencia de observación e intervención</p>
                  <h2>Actividad en los últimos 7 días</h2>
                  <p>
                    Señales observadas y alertas emitidas por día sobre tus fuentes con permiso.
                  </p>
                </div>
                <span className="chip chip--warning">
                  <i className="dot dot--warning" aria-hidden="true" />
                  Pico: {peakDay?.count ?? 0} ({peakDay?.label})
                </span>
              </div>
              <div className="vchart" role="img" aria-label="Gráfica de barras de 7 días">
                {dayBars.map((b, i) => (
                  <div
                    key={`${b.label}-${i}`}
                    className={`vchart-col ${b.isPeak ? "is-peak" : ""}`}
                  >
                    <div className="vchart-bar-wrap">
                      <div className="vchart-bar" style={{ height: `${b.heightPct}%` }}>
                        {b.count > 0 ? <span className="vchart-tag">{b.count}</span> : null}
                      </div>
                    </div>
                    <span className="vchart-day">{b.label}</span>
                  </div>
                ))}
              </div>
              <div className="vchart-summary">
                <div className="vchart-stat">
                  <small>Señales (7d)</small>
                  <strong>{digest.signalCount}</strong>
                </div>
                <div className="vchart-stat">
                  <small>Alertas (7d)</small>
                  <strong>{digest.protectedCount}</strong>
                </div>
                <div className="vchart-stat">
                  <small>Pendientes</small>
                  <strong>{pendingAlerts}</strong>
                </div>
                <div className="vchart-stat">
                  <small>Egress remoto</small>
                  <strong>$0.00</strong>
                </div>
              </div>
            </section>

            <div className="bento-stack">
              <section className="panel" aria-label="Vectores detectados">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">Desglose por señal</p>
                    <h2>Vectores de manipulación detectados</h2>
                  </div>
                  <span className="ep-badge ep-badge--observed">
                    {digest.categories.reduce((acc, c) => acc + c.count, 0)} marcas
                  </span>
                </div>
                {digest.categories.length > 0 ? (
                  <ul className="bars">
                    {digest.categories.map((c, idx) => {
                      const tone = CAT_COLORS[idx % CAT_COLORS.length];
                      const pct = Math.max(
                        10,
                        Math.round((c.count / digest.categories[0].count) * 100),
                      );
                      return (
                        <li key={c.label}>
                          <span
                            className="bars-label"
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                          >
                            <i className={`cat-sq cat-sq--${tone}`} aria-hidden="true" />
                            {c.label}
                          </span>
                          <span className="bars-track" aria-hidden="true">
                            <span className="bars-fill" style={{ width: `${pct}%` }} />
                          </span>
                          <strong className="bars-count">{c.count}</strong>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty">
                    <strong>Sin vectores registrados esta semana.</strong> Usa el simulador de abajo
                    para emitir una secuencia de prueba y ver cómo se clasifica.
                  </p>
                )}
              </section>

              <section className="panel" aria-label="Simulador operativo">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">
                      {dev ? "Harness interactivo · ADR-0014" : "Prueba interactiva en local"}
                    </p>
                    <h2>{dev ? "Laboratorio de señales y políticas" : "Prueba tu protección ahora"}</h2>
                    <p>
                      Ejecuta acciones reales contra el motor local sin consumo de APIs externas.
                    </p>
                  </div>
                </div>
                <div className="head-actions">
                  <form action={mintLabConsent}>
                    <button className="btn-op" type="submit">
                      1. Autorizar permiso lab
                    </button>
                  </form>
                  <form action={emitSequencePair}>
                    <button className="btn-op btn-op--primary" type="submit">
                      2. Simular gancho→pago
                    </button>
                  </form>
                  <form action={emitUiTreeObservation}>
                    <button className="btn-op" type="submit">
                      3. Emitir sensor UI_TREE
                    </button>
                  </form>
                  {pendingAlerts > 0 ? (
                    <form action={dispatchInterventionsAction}>
                      <button className="btn-op" type="submit">
                        Despachar ({pendingAlerts})
                      </button>
                    </form>
                  ) : null}
                  {activeDevices === 0 ? (
                    <form action={connectThisDeviceAction}>
                      <button className="btn-op" type="submit">
                        Vincular navegador
                      </button>
                    </form>
                  ) : null}
                </div>
              </section>
            </div>
          </div>

          {/* ROW 3 — Structured Live Ledger Table + Anti-Social-Engineering Playbook */}
          <div className="bento-asym">
            <section className="panel" aria-label="Registro reciente de actividad">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Trazabilidad verificable</p>
                  <h2>Registro reciente de alertas y señales</h2>
                </div>
                <Link className="btn-op" href="/enterprise/audit">
                  Auditoría completa ({data.audit_events.length})
                </Link>
              </div>
              {feed.length > 0 ? (
                <div className="op-table-wrap">
                  <table className="op-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Evento</th>
                        <th>Detalle observado</th>
                        <th>Origen</th>
                        <th>Hace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feed.map((f, idx) => (
                        <tr key={`${f.at}-${idx}`}>
                          <td>
                            <code>#{String(idx + 1).padStart(2, "0")}</code>
                          </td>
                          <td>
                            <div className="op-cell-main">
                              <i
                                className={`dot dot--${
                                  f.kind === "alert" ? "warning" : "brand"
                                }`}
                                aria-hidden="true"
                              />
                              <div className="op-cell-stack">
                                <strong>{f.title}</strong>
                              </div>
                            </div>
                          </td>
                          <td>{f.note}</td>
                          <td>
                            <span
                              className={`ep-badge ${
                                f.kind === "alert" ? "ep-badge--policy" : "ep-badge--observed"
                              }`}
                            >
                              {f.kind === "alert" ? "Política" : "Observado"}
                            </span>
                          </td>
                          <td>{timeAgo(f.at, now)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty">
                  <strong>Sin actividad registrada todavía.</strong> Lanza una simulación arriba
                  para poblar el registro en tiempo real.
                </p>
              )}
            </section>

            <section className="panel" aria-label="Guía educativa">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Educación de defensa</p>
                  <h2>Cómo operan las tácticas que SOVIR detecta</h2>
                  <p>Patrones reales de ingeniería social explicados sin tecnicismos.</p>
                </div>
              </div>
              <ul className="tips">
                {tips.map((t) => (
                  <li key={t.q}>
                    <details>
                      <summary>{t.q}</summary>
                      <p>{t.a}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
