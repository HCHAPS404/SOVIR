import Link from "next/link";
import { cookies } from "next/headers";
import type { BudgetView, Principal, PrincipalDataExport } from "../lib/api";
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
import { fill, getLocale, stringsFor } from "../lib/i18n";
import { TIPS } from "../lib/tips-i18n";
import { getView } from "../lib/view";
import { Sparkline } from "./Sparkline";

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
  budget,
}: {
  me: Principal | null;
  data: PrincipalDataExport | null;
  version: { version: string; contract: string; build_sha: string } | null;
  backendDown: boolean;
  budget: BudgetView | null;
}) {
  const view = await getView(me?.is_admin);
  const dev = view === "dev";
  const locale = await getLocale();
  const s = stringsFor(locale);
  const tips = TIPS[locale];
  const now = Date.now();
  const digest = data ? weeklyDigest(data, now) : null;
  const feed = data ? recentActivity(data, 8) : [];
  // preferred_username (display-only cookie set at login) wins over the
  // raw principal_id — under OIDC that id is the `sub` UUID.
  const displayName = (await cookies()).get("sovir_display_name")?.value;
  const nick =
    displayName || (me?.principal_id.replace(/^console-/, "") ?? "usuario");

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

  if (backendDown || !data || !digest) {
    return (
      <div className="desk">
        <section className="panel" aria-label="Sin conexión">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Estado del servicio</p>
              <h2>No pudimos conectar con el motor de SOVIR</h2>
              <p>
                Verifica que el servicio local esté encendido en <code>127.0.0.1:8787</code> y
                recarga esta página.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // VISTA SENCILLA (CLIENTE / CUALQUIER PERSONA) — Clara, sin saturación
  // =========================================================================
  if (!dev) {
    return (
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className="dot dot--success" aria-hidden="true" />
              {s.overview.kicker}
            </p>
            <h1>{fill(s.overview.greeting, { x: nick })}</h1>
            <p className="page-head-sub">{s.overview.sub}</p>
          </div>
          <div className="head-actions">
            {budget ? (
              <span className="chip" title={s.overview.budgetChip}>
                {fill(s.overview.budgetChip, {
                  a: budget.spent_usd.toFixed(2),
                  b: budget.cap_usd.toFixed(2),
                })}
              </span>
            ) : null}
            <form action={emitSequencePair}>
              <button className="btn-op btn-op--primary" type="submit">
                {s.overview.testButton}
              </button>
            </form>
          </div>
        </header>

        {/* Bloque principal: Estado de tu semana + Cómo funciona */}
        <div className="bento-asym">
          <section className="user-hero" aria-label="Estado de tu semana">
            <div className="user-hero-top">
              <div>
                <span
                  className={`chip chip--${
                    digest.status === "protected" ? "warning" : "success"
                  }`}
                >
                  <i
                    className={`dot dot--${
                      digest.status === "protected" ? "warning" : "success"
                    }`}
                  />
                  {digest.status === "protected"
                    ? s.overview.chipWarnings
                    : s.overview.chipClean}
                </span>
                {digest.status === "protected" ? (
                  <>
                    <h2>{s.overview.heroWarnTitle(digest.protectedCount)}</h2>
                    <p>
                      {s.overview.heroWarnSub}
                      {digest.lastAlertAt
                        ? ` (${fill(s.common.lastAlertAgo, {
                            x: timeAgo(digest.lastAlertAt, now),
                          })})`
                        : ""}
                    </p>
                  </>
                ) : digest.status === "quiet" ? (
                  <>
                    <h2>{s.overview.heroQuietTitle}</h2>
                    <p>{s.overview.heroQuietSub(digest.signalCount)}</p>
                  </>
                ) : (
                  <>
                    <h2>{s.overview.heroEmptyTitle}</h2>
                    <p>{s.overview.heroEmptySub}</p>
                  </>
                )}
              </div>
              {activityTrend ? (
                <span className={`trend trend--${activityTrend.tone}`}>{activityTrend.label}</span>
              ) : null}
            </div>

            <div className="vchart" role="img" aria-label="Actividad de los últimos 7 días">
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
          </section>

          <section className="panel" aria-label={s.overview.howTitle}>
            <div className="panel-head">
              <div>
                <p className="panel-kicker">{s.overview.howKicker}</p>
                <h2>{s.overview.howTitle}</h2>
              </div>
            </div>
            <ul className="how-list">
              <li>
                <i className="dot dot--success" aria-hidden="true" />
                <div>
                  <strong>{s.overview.how1T}</strong>
                  <span>{s.overview.how1S}</span>
                </div>
              </li>
              <li>
                <i className="dot dot--brand" aria-hidden="true" />
                <div>
                  <strong>{s.overview.how2T}</strong>
                  <span>{s.overview.how2S}</span>
                </div>
              </li>
              <li>
                <i
                  className={`dot dot--${activeGrants > 0 ? "success" : "warning"}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>{s.overview.how3T}</strong>
                  <span>{s.overview.how3S(activeGrants, activeDevices)}</span>
                </div>
              </li>
            </ul>
            <div className="head-actions" style={{ marginTop: "auto" }}>
              <Link className="btn-op" href="/permissions">
                {s.overview.seePermissions}
              </Link>
              <Link className="btn-op" href="/devices">
                {s.overview.seeDevices}
              </Link>
            </div>
          </section>
        </div>

        {/* Segundo bloque: Qué detectamos + Guía rápida para no caer en trampas */}
        <div className="bento-2col">
          <section className="panel" aria-label={s.overview.catTitle}>
            <div className="panel-head">
              <div>
                <p className="panel-kicker">{s.overview.catKicker}</p>
                <h2>{s.overview.catTitle}</h2>
                <p>{s.overview.catSub}</p>
              </div>
              <Link className="btn-op" href="/incidents">
                {s.overview.catSeeAlerts(data.interventions.length)}
              </Link>
            </div>

            {digest.categories.length > 0 ? (
              <ul className="bars">
                {digest.categories.map((c, idx) => {
                  const tone = CAT_COLORS[idx % CAT_COLORS.length];
                  const pct = Math.max(
                    12,
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
                <strong>{s.overview.feedEmpty}</strong>
              </p>
            )}
          </section>

          <section className="panel" aria-label={s.overview.tipsTitle}>
            <div className="panel-head">
              <div>
                <p className="panel-kicker">{s.overview.tipsKicker}</p>
                <h2>{s.overview.tipsTitle}</h2>
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
      </div>
    );
  }

  // =========================================================================
  // MODO TÉCNICO (DESARROLLADOR / OPERADOR) — Bento completo y telemetría
  // =========================================================================
  return (
    <div className="desk">
      <header className="page-head">
        <div className="page-head-title">
          <p className="live-kicker">
            <i className="dot dot--success" aria-hidden="true" />
            {digest.lastActivityAt
              ? `Última actividad ${timeAgo(digest.lastActivityAt, now)}`
              : "Motor activo · esperando primeras señales"}
          </p>
          <h1>Consola Operativa · {me?.principal_id ?? ""}</h1>
          <p className="page-head-sub">
            Sesión autenticada en tenant <code>{me?.tenant_id ?? "dev"}</code> · API v
            {version?.version ?? "0.1"} ({version?.contract ?? "v1"}) · Egress en modo{" "}
            <code>record</code> ($0.00).
          </p>
        </div>
        <div className="head-actions">
          <form action={emitSequencePair}>
            <button className="btn-op btn-op--primary" type="submit">
              + Emitir par gancho→pago
            </button>
          </form>
          <Link className="btn-op" href="/investigations">
            Investigaciones →
          </Link>
        </div>
      </header>

      <div className="kpi-grid">
        <section className="kpi-card kpi-card--amber" aria-label="Alertas de protección">
          <div className="kpi-top">
            <span className="kpi-titles">
              <small>Protección 7D</small>
              <strong>Intervenciones</strong>
            </span>
            <span className="ep-badge ep-badge--policy">Política dev-1</span>
          </div>
          <div className="kpi-mid">
            <p className="kpi-num">{digest.protectedCount}</p>
            <span className="ep-badge">{pendingAlerts} pendientes</span>
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
                ? `Última ${timeAgo(digest.lastAlertAt, now)}`
                : "Sin alertas esta semana"}
            </span>
            <Link href="/incidents">Cola Kanban →</Link>
          </div>
        </section>

        <section className="kpi-card kpi-card--slate" aria-label="Señales observadas">
          <div className="kpi-top">
            <span className="kpi-titles">
              <small>Telemetría local</small>
              <strong>Eventos observados</strong>
            </span>
            <span className="ep-badge ep-badge--observed">Observado</span>
          </div>
          <div className="kpi-mid">
            <p className="kpi-num">{digest.signalCount}</p>
            <span className="ep-badge">{data.events.length} total</span>
          </div>
          <Sparkline
            values={dailyBuckets(
              data.events.map((e) => e.observed_at_ms),
              7,
              now,
            )}
          />
          <div className="kpi-foot">
            <span>{digest.categories.length} clases de señal</span>
            <Link href="/investigations">Barrer ventana →</Link>
          </div>
        </section>

        <section className="kpi-card kpi-card--sage" aria-label="Cobertura de permisos">
          <div className="kpi-top">
            <span className="kpi-titles">
              <small>Consentimiento</small>
              <strong>Grants activos</strong>
            </span>
            <span className="ep-badge ep-badge--verified">Revocable</span>
          </div>
          <div className="kpi-mid">
            <p className="kpi-num">{activeGrants}</p>
            <span className="ep-badge">{data.grants.length} total</span>
          </div>
          <SegBar active={Math.min(8, activeGrants * 4)} total={8} tone="sage" />
          <div className="kpi-foot">
            <span>Validados en ingesta</span>
            <Link href="/permissions">Gobernanza →</Link>
          </div>
        </section>

        <section className="kpi-card" aria-label="Dispositivos y aislamiento">
          <div className="kpi-top">
            <span className="kpi-titles">
              <small>Superficies</small>
              <strong>Equipos vinculados</strong>
            </span>
            <span className="ep-badge">Aislado</span>
          </div>
          <div className="kpi-mid">
            <p className="kpi-num">{activeDevices}</p>
            <span className="ep-badge">{data.audit_events.length} trazas</span>
          </div>
          <SegBar active={Math.min(8, Math.max(2, activeDevices * 4))} total={8} tone="brand" />
          <div className="kpi-foot">
            <span>{me?.principal_id}</span>
            <Link href="/devices">Matriz OS →</Link>
          </div>
        </section>
      </div>

      <div className="bento-asym">
        <section className="panel" aria-label="Actividad de los últimos 7 días">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Cadencia de observación e intervención</p>
              <h2>Actividad operativa (7 días)</h2>
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
              <p className="empty">Sin vectores registrados en la ventana.</p>
            )}
          </section>

          <section className="panel" aria-label="Simulador operativo">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Harness interactivo · ADR-0014</p>
                <h2>Laboratorio de señales y políticas</h2>
              </div>
            </div>
            <div className="head-actions">
              <form action={mintLabConsent}>
                <button className="btn-op" type="submit">
                  1. Grant lab
                </button>
              </form>
              <form action={emitSequencePair}>
                <button className="btn-op btn-op--primary" type="submit">
                  2. Par gancho→pago
                </button>
              </form>
              <form action={emitUiTreeObservation}>
                <button className="btn-op" type="submit">
                  3. Evento UI_TREE
                </button>
              </form>
              {pendingAlerts > 0 ? (
                <form action={dispatchInterventionsAction}>
                  <button className="btn-op" type="submit">
                    Dispatch ({pendingAlerts})
                  </button>
                </form>
              ) : null}
              {activeDevices === 0 ? (
                <form action={connectThisDeviceAction}>
                  <button className="btn-op" type="submit">
                    Registrar navegador
                  </button>
                </form>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <section className="panel" aria-label="Registro reciente de actividad">
        <div className="panel-head">
          <div>
            <p className="panel-kicker">Trazabilidad verificable</p>
            <h2> Flujo reciente de eventos e intervenciones</h2>
          </div>
          <Link className="btn-op" href="/enterprise/audit">
            Auditoría ({data.audit_events.length}) →
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
                      <strong>{f.title}</strong>
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
          <p className="empty">Sin actividad registrada todavía.</p>
        )}
      </section>
    </div>
  );
}
