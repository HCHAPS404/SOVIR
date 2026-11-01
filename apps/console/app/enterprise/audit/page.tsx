import { ConsoleFrame, requireApiSession } from "../../../components/ConsoleFrame";
import { emitSequencePair, enforceRetentionAction } from "../../../lib/actions";
import { listAudit } from "../../../lib/api";
import { auditTone, describeAudit } from "../../../lib/humanize";
import { live } from "../../../lib/live";
import { getView } from "../../../lib/view";

export const metadata = { title: "Auditoría" };

export default async function AuditPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const items = await live((t) => listAudit(t, 100));

  const sessionCount =
    items?.filter((a) => a.action === "session_issued" || a.action === "session_revoked").length ??
    0;
  const signalCount =
    items?.filter((a) => a.action === "event_ingested" || a.action === "intervention_dispatched")
      .length ?? 0;
  const consentCount =
    items?.filter(
      (a) =>
        a.action === "consent_granted" ||
        a.action === "consent_revoked" ||
        a.action === "device_registered" ||
        a.action === "device_revoked",
    ).length ?? 0;
  const dataCount =
    items?.filter((a) => a.action === "data_exported" || a.action === "data_purged").length ?? 0;

  const breakdown = [
    { label: "Señales y decisiones de política", count: signalCount, tone: "amber" },
    { label: "Cambios de permisos y dispositivos", count: consentCount, tone: "sage" },
    { label: "Inicios y cierres de sesión", count: sessionCount, tone: "slate" },
    { label: "Exportaciones y purgas de datos", count: dataCount, tone: "copper" },
  ];
  const maxCat = Math.max(...breakdown.map((b) => b.count), 1);

  return (
    <ConsoleFrame current="/enterprise/audit">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className="dot dot--success" aria-hidden="true" />
              Rastro append-only por principal · sin contenido privado ni PII
            </p>
            <h1>Auditoría Inmutable</h1>
            <p className="page-head-sub">
              Todo lo que ocurrió con tu sesión, tus permisos y las decisiones del motor de
              políticas, registrado en orden cronológico.
            </p>
          </div>
          <div className="head-actions">
            <form action={emitSequencePair}>
              <button className="btn-op btn-op--primary" type="submit">
                + Generar actividad de prueba
              </button>
            </form>
            <form action={enforceRetentionAction}>
              <button className="btn-op" type="submit">
                Aplicar retención
              </button>
            </form>
          </div>
        </header>

        {items === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <>
            {/* Row 1 — 4 KPI Cards */}
            <div className="kpi-grid">
              <section className="kpi-card kpi-card--slate">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Rastro total</small>
                    <strong>Eventos auditados</strong>
                  </span>
                  <span className="ep-badge ep-badge--observed">Inmutable</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{items.length}</p>
                  <span className="ep-badge">límite 100</span>
                </div>
                <div className="kpi-foot">
                  <span>Aislados bajo tu principal</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--amber">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Motor de reglas</small>
                    <strong>Señales y alertas</strong>
                  </span>
                  <span className="ep-badge ep-badge--policy">Política dev-1</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{signalCount}</p>
                  <span className="ep-badge">evaluaciones</span>
                </div>
                <div className="kpi-foot">
                  <span>Cada ingesta deja evidencia auditable</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--sage">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Gobernanza</small>
                    <strong>Permisos y equipos</strong>
                  </span>
                  <span className="ep-badge ep-badge--verified">Consentimiento</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{consentCount}</p>
                  <span className="ep-badge">cambios</span>
                </div>
                <div className="kpi-foot">
                  <span>Altas y revocaciones con sello de tiempo</span>
                </div>
              </section>

              <section className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Acceso</small>
                    <strong>Sesiones registradas</strong>
                  </span>
                  <span className="ep-badge">Auth local</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{sessionCount}</p>
                  <span className="ep-badge">tokens</span>
                </div>
                <div className="kpi-foot">
                  <span>Emisión y cierre de sesiones</span>
                </div>
              </section>
            </div>

            {/* Row 2 — 2-Column Bento: Structured Audit Ledger Table + Category Bars & Timeline */}
            <div className="bento-asym">
              <section className="panel" aria-label="Tabla de auditoría">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">Libro mayor de operaciones</p>
                    <h2>Registro detallado de auditoría ({items.length})</h2>
                  </div>
                </div>
                {items.length === 0 ? (
                  <p className="empty">
                    <strong>Sin acciones registradas todavía.</strong> Cada sesión, permiso y señal
                    quedará aquí en orden.
                  </p>
                ) : (
                  <div className="op-table-wrap">
                    <table className="op-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Operación</th>
                          <th>Detalle verificable</th>
                          <th>Categoría</th>
                          <th>Fecha y hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((a, idx) => {
                          const d = describeAudit(a);
                          const tone = auditTone(a.action);
                          const at = new Date(a.at_ms);
                          return (
                            <tr key={a.audit_id}>
                              <td>
                                <code>#{String(idx + 1).padStart(2, "0")}</code>
                              </td>
                              <td>
                                <div className="op-cell-main">
                                  <i className={`dot dot--${tone}`} aria-hidden="true" />
                                  <div className="op-cell-stack">
                                    <strong>{d.title}</strong>
                                    {dev ? <span className="row-tech">{a.action}</span> : null}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className="op-cell-stack">
                                  <span>{d.sub || "Operación registrada"}</span>
                                  {dev ? <span className="row-tech">{a.detail}</span> : null}
                                </div>
                              </td>
                              <td>
                                <span className="ep-badge">{a.action.split("_")[0]}</span>
                              </td>
                              <td>
                                {at.toLocaleDateString("es", { day: "numeric", month: "short" })} ·{" "}
                                {at.toLocaleTimeString("es", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <div className="bento-stack">
                <section className="panel" aria-label="Distribución por tipo">
                  <div className="panel-head">
                    <div>
                      <p className="panel-kicker">Composición del rastro</p>
                      <h2>Operaciones por categoría</h2>
                    </div>
                  </div>
                  <ul className="bars">
                    {breakdown.map((b) => (
                      <li key={b.label}>
                        <span
                          className="bars-label"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                        >
                          <i className={`cat-sq cat-sq--${b.tone}`} aria-hidden="true" />
                          {b.label}
                        </span>
                        <span className="bars-track" aria-hidden="true">
                          <span
                            className="bars-fill"
                            style={{
                              width: `${b.count === 0 ? 6 : Math.max(12, Math.round((b.count / maxCat) * 100))}%`,
                            }}
                          />
                        </span>
                        <strong className="bars-count">{b.count}</strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="panel" aria-label="Línea de tiempo reciente">
                  <div className="panel-head">
                    <div>
                      <p className="panel-kicker">Secuencia cronológica</p>
                      <h2>Últimos 8 eventos</h2>
                    </div>
                  </div>
                  {items.length === 0 ? (
                    <p className="empty">Sin eventos recientes.</p>
                  ) : (
                    <ol className="timeline">
                      {items.slice(0, 8).map((a) => {
                        const d = describeAudit(a);
                        const at = new Date(a.at_ms);
                        return (
                          <li key={`tl-${a.audit_id}`}>
                            <i className={`dot dot--${auditTone(a.action)}`} aria-hidden="true" />
                            <span className="tl-body">
                              <strong>{d.title}</strong>
                              {d.sub ? <span className="tl-sub">{d.sub}</span> : null}
                            </span>
                            <time dateTime={at.toISOString()}>
                              {at.toLocaleTimeString("es", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </ConsoleFrame>
  );
}
