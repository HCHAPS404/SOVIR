import Link from "next/link";
import { cookies } from "next/headers";
import type { BudgetView, Principal, PrincipalDataExport } from "../lib/api";
import {
  dailyLabeledBuckets,
  timeAgo,
  trendDelta,
  weeklyDigest,
} from "../lib/digest";
import { fill, getLocale, stringsFor } from "../lib/i18n";
import { TIPS } from "../lib/tips-i18n";

const CAT_COLORS = ["amber", "copper", "plum", "slate", "sage", "brand"] as const;

export async function OverviewBoard({
  me,
  data,
  backendDown,
  budget,
}: {
  me: Principal | null;
  data: PrincipalDataExport | null;
  version: { version: string; contract: string; build_sha: string } | null;
  backendDown: boolean;
  budget: BudgetView | null;
}) {
  const locale = await getLocale();
  const s = stringsFor(locale);
  const tips = TIPS[locale];
  const now = Date.now();
  const digest = data ? weeklyDigest(data, now) : null;
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

  const activeGrants = data
    ? data.grants.filter((g) => !g.revoked && g.expires_at_ms > now).length
    : 0;
  const activeDevices = data ? data.devices.filter((d) => !d.revoked_at_ms).length : 0;

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
