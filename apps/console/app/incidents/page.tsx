import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import {
  dispatchInterventionsAction,
  emitSequencePair,
  emitUiTreeObservation,
} from "../../lib/actions";
import { exportData } from "../../lib/api";
import { timeAgo } from "../../lib/digest";
import { describeIntervention } from "../../lib/humanize";
import { live } from "../../lib/live";
import { getView } from "../../lib/view";

export const metadata = { title: "Incidentes" };

function SegBar({
  active,
  total = 5,
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

export default async function IncidentsPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const data = await live(exportData);
  const now = Date.now();

  const items = data?.interventions ?? [];
  const events = data?.events ?? [];
  const pending = items.filter((i) => i.state === "pending");
  const delivered = items.filter((i) => i.state === "delivered");
  const failedOrOther = items.filter((i) => i.state !== "pending" && i.state !== "delivered");

  return (
    <ConsoleFrame current="/incidents">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className={`dot dot--${pending.length > 0 ? "warning" : "success"}`} />
              {pending.length > 0
                ? `${pending.length} ${pending.length === 1 ? "alerta pendiente" : "alertas pendientes"} de despacho`
                : "Cola de intervenciones al día"}
            </p>
            <h1>Incidentes e Intervenciones</h1>
            <p className="page-head-sub">
              Cada decisión tomada por el motor de políticas sobre tus señales observadas —
              organizada por estado operativo y verificable de principio a fin.
            </p>
          </div>
          <div className="head-actions">
            {pending.length > 0 ? (
              <form action={dispatchInterventionsAction}>
                <button className="btn-op btn-op--primary" type="submit">
                  Despachar pendientes ({pending.length})
                </button>
              </form>
            ) : null}
            <form action={emitSequencePair}>
              <button className="btn-op" type="submit">
                + Simular estafa (gancho→pago)
              </button>
            </form>
            <form action={emitUiTreeObservation}>
              <button className="btn-op" type="submit">
                + Emitir UI_TREE
              </button>
            </form>
          </div>
        </header>

        {data === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <>
            {/* KPI Summary Row */}
            <div className="kpi-grid">
              <section className="kpi-card kpi-card--amber">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>En cola</small>
                    <strong>Pendientes de mostrar</strong>
                  </span>
                  <span className="ep-badge ep-badge--inferred">Acción requerida</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{pending.length}</p>
                  <SegBar active={Math.min(5, pending.length)} total={5} tone="amber" />
                </div>
                <div className="kpi-foot">
                  <span>Listas para despacho al cliente</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--sage">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Completadas</small>
                    <strong>Alertas entregadas</strong>
                  </span>
                  <span className="ep-badge ep-badge--verified">Entregado</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{delivered.length}</p>
                  <SegBar active={Math.min(5, delivered.length)} total={5} tone="sage" />
                </div>
                <div className="kpi-foot">
                  <span>Confirmadas en el rastro de auditoría</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--slate">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Evidencia base</small>
                    <strong>Señales observadas</strong>
                  </span>
                  <span className="ep-badge ep-badge--observed">Observado</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{events.length}</p>
                  <SegBar active={Math.min(5, events.length)} total={5} tone="brand" />
                </div>
                <div className="kpi-foot">
                  <span>Eventos evaluados bajo consentimiento</span>
                </div>
              </section>

              <section className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Autorización</small>
                    <strong>Motor de políticas</strong>
                  </span>
                  <span className="ep-badge ep-badge--policy">dev-1</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{items.length}</p>
                  <span className="ep-badge">{failedOrOther.length} fallidas</span>
                </div>
                <div className="kpi-foot">
                  <span>Los modelos nunca autorizan acciones</span>
                </div>
              </section>
            </div>

            {/* St. Aurelia-Style 3-Column Operational Kanban */}
            <div className="kanban-grid" aria-label="Tablero de intervenciones por estado">
              <section className="kanban-col">
                <header className="kanban-col-head">
                  <h2>
                    <i className="dot dot--warning" aria-hidden="true" />
                    Pendientes de entrega
                  </h2>
                  <span className="kanban-count">{pending.length}</span>
                </header>
                {pending.length === 0 ? (
                  <p className="empty">
                    <strong>Sin alertas pendientes.</strong> Todas las intervenciones han sido
                    despachadas o aún no se ha disparado una regla.
                  </p>
                ) : (
                  <ul className="kanban-list">
                    {pending.slice(0, 6).map((i, idx) => {
                      const d = describeIntervention(i);
                      const code = dev
                        ? i.intervention_id.slice(0, 10).toUpperCase()
                        : `ALT-${String(idx + 1).padStart(2, "0")}`;
                      return (
                        <li className="kanban-card" key={i.intervention_id}>
                          <div className="kanban-card-top">
                            <strong>{d.title}</strong>
                            <span className="kanban-code">{code}</span>
                          </div>
                          <p>{d.what}</p>
                          <div className="kanban-card-foot">
                            <SegBar active={4} total={5} tone="amber" />
                            <time>
                              {new Date(i.created_at_ms).toLocaleTimeString("es", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="kanban-col">
                <header className="kanban-col-head">
                  <h2>
                    <i className="dot dot--success" aria-hidden="true" />
                    Mostradas / Entregadas
                  </h2>
                  <span className="kanban-count">{delivered.length}</span>
                </header>
                {delivered.length === 0 ? (
                  <p className="empty">
                    <strong>Ninguna alerta entregada aún.</strong> Pulsa “Despachar pendientes”
                    arriba para entregar las alertas en cola.
                  </p>
                ) : (
                  <ul className="kanban-list">
                    {delivered.slice(0, 6).map((i, idx) => {
                      const d = describeIntervention(i);
                      const code = dev
                        ? i.intervention_id.slice(0, 10).toUpperCase()
                        : `OK-${String(idx + 1).padStart(2, "0")}`;
                      return (
                        <li className="kanban-card" key={i.intervention_id}>
                          <div className="kanban-card-top">
                            <strong>{d.title}</strong>
                            <span className="kanban-code">{code}</span>
                          </div>
                          <p>{d.what}</p>
                          <div className="kanban-card-foot">
                            <SegBar active={5} total={5} tone="sage" />
                            <time>
                              {new Date(i.created_at_ms).toLocaleTimeString("es", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="kanban-col">
                <header className="kanban-col-head">
                  <h2>
                    <i className="dot dot--brand" aria-hidden="true" />
                    Señales observadas (base)
                  </h2>
                  <span className="kanban-count">{events.length}</span>
                </header>
                {events.length === 0 ? (
                  <p className="empty">
                    <strong>Sin señales observadas.</strong> Emite un par de prueba arriba para ver
                    la cadena evento → política → intervención.
                  </p>
                ) : (
                  <ul className="kanban-list">
                    {events.slice(0, 6).map((e, idx) => {
                      const code = dev
                        ? e.event_id.slice(0, 10).toUpperCase()
                        : `OBS-${String(idx + 1).padStart(2, "0")}`;
                      return (
                        <li className="kanban-card" key={e.event_id}>
                          <div className="kanban-card-top">
                            <strong>
                              {e.modality === "UI_TREE"
                                ? "Observación de interfaz"
                                : "Señal de actividad"}
                            </strong>
                            <span className="kanban-code">{code}</span>
                          </div>
                          <p>
                            Señales:{" "}
                            {e.signals.length > 0 ? e.signals.join(" · ") : "sin marcas de riesgo"}
                          </p>
                          <div className="kanban-card-foot">
                            <SegBar
                              active={Math.min(5, Math.max(1, e.signals.length * 2))}
                              total={5}
                              tone="brand"
                            />
                            <time>{timeAgo(e.observed_at_ms, now)}</time>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            {/* Full Structured Ledger Table */}
            <section className="panel" aria-label="Tabla completa de intervenciones">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Registro detallado</p>
                  <h2>Historial completo de intervenciones ({items.length})</h2>
                </div>
                <span className="ep-badge ep-badge--policy">Autorizado por política</span>
              </div>
              {items.length === 0 ? (
                <p className="empty">
                  Aún no te ha protegido de nada — cuando SOVIR intervenga aparecerá aquí qué
                  detectó y por qué.
                </p>
              ) : (
                <div className="op-table-wrap">
                  <table className="op-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Intervención y motivo</th>
                        <th>Origen</th>
                        <th>Intentos</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i, idx) => {
                        const d = describeIntervention(i);
                        const tone =
                          i.state === "pending"
                            ? "warning"
                            : i.state === "delivered"
                              ? "success"
                              : i.state === "failed"
                                ? "danger"
                                : "unknown";
                        const at = new Date(i.created_at_ms);
                        return (
                          <tr key={i.intervention_id}>
                            <td>
                              <code>
                                {dev
                                  ? i.intervention_id.slice(0, 12)
                                  : `#${String(idx + 1).padStart(2, "0")}`}
                              </code>
                            </td>
                            <td>
                              <div className="op-cell-stack">
                                <strong>{d.title}</strong>
                                <small>{d.what}</small>
                                {dev ? (
                                  <span className="row-tech">
                                    event:{i.event_id} · kind:{i.kind}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <span className="ep-badge ep-badge--policy">Política dev-1</span>
                            </td>
                            <td>
                              <code>{i.attempts}</code>
                            </td>
                            <td>
                              <span className={`chip chip--${tone}`}>
                                <i className={`dot dot--${tone}`} />
                                {d.state}
                              </span>
                            </td>
                            <td>
                              {at.toLocaleDateString("es", { day: "numeric", month: "short" })} ·{" "}
                              {at.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ConsoleFrame>
  );
}
