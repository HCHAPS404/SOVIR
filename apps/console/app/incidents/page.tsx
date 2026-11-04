import { cookies } from "next/headers";
import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { SubmitButton } from "../../components/SubmitButton";
import {
  assessEventSignalsAction,
  dispatchInterventionsAction,
  emitSequencePair,
  emitUiTreeObservation,
  explainEventAction,
  sendEventFeedbackAction,
} from "../../lib/actions";
import { exportData, type Explanation, type InferenceVerdict } from "../../lib/api";
import { timeAgo } from "../../lib/digest";
import { describeHypothesis, describeIntervention } from "../../lib/humanize";
import { live } from "../../lib/live";
import { getView } from "../../lib/view";

export const metadata = { title: "Avisos de seguridad" };

interface EventInferenceResult {
  ok: boolean;
  event_id: string;
  privacy: "private" | "standard";
  signals: string[];
  at_ms: number;
  verdict?: InferenceVerdict;
  error?: string;
}

interface EventExplanationResult {
  ok: boolean;
  event_id: string;
  at_ms: number;
  explanation?: Explanation;
  error?: string;
}

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

function userAdviceFor(eventId: string): string {
  const prefix = eventId.split("-")[0];
  if (prefix === "pay") {
    return "No hagas pagos ni transferencias bajo presión. Cierra la ventana y verifica con la entidad por un canal oficial.";
  }
  if (prefix === "uit") {
    return "Revisa con cuidado las casillas marcadas y el botón de rechazar antes de aceptar cualquier condición.";
  }
  return "Tómate un minuto antes de responder o entregar información personal.";
}

export default async function IncidentsPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const data = await live(exportData);
  const now = Date.now();
  const jar = await cookies();
  const rawInf = jar.get("sovir_last_inference")?.value;
  let lastInference: EventInferenceResult | null = null;
  if (rawInf) {
    try {
      const parsed = JSON.parse(rawInf) as EventInferenceResult;
      if (parsed.event_id) lastInference = parsed;
    } catch {
      lastInference = null;
    }
  }
  const rawExp = jar.get("sovir_last_explanation")?.value;
  let lastExplanation: EventExplanationResult | null = null;
  if (rawExp) {
    try {
      const parsed = JSON.parse(rawExp) as EventExplanationResult;
      if (parsed.event_id) lastExplanation = parsed;
    } catch {
      lastExplanation = null;
    }
  }

  const items = data?.interventions ?? [];
  const events = data?.events ?? [];
  const labels = new Map((data?.feedback_labels ?? []).map((f) => [f.event_id, f.verdict]));
  const pending = items.filter((i) => i.state === "pending");
  const delivered = items.filter((i) => i.state === "delivered");
  const failedOrOther = items.filter((i) => i.state !== "pending" && i.state !== "delivered");

  if (data === null) {
    return (
      <ConsoleFrame current="/incidents">
        <div className="desk">
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>No pudimos conectar con el servicio local de SOVIR en 127.0.0.1:8787.</p>
          </section>
        </div>
      </ConsoleFrame>
    );
  }

  // =========================================================================
  // VISTA SENCILLA (CLIENTE) — Tarjetas claras de avisos, sin tablas ni Kanban
  // =========================================================================
  if (!dev) {
    return (
      <ConsoleFrame current="/incidents">
        <div className="desk">
          <header className="page-head">
            <div className="page-head-title">
              <p className="live-kicker">
                <i
                  className={`dot dot--${pending.length > 0 ? "warning" : "success"}`}
                  aria-hidden="true"
                />
                {items.length > 0
                  ? `${items.length} ${items.length === 1 ? "aviso registrado" : "avisos registrados"} para cuidarte`
                  : "No hemos tenido que darte ningún aviso todavía"}
              </p>
              <h1>Avisos de seguridad</h1>
              <p className="page-head-sub">
                Cada vez que SOVIR detecta una página o mensaje que intenta engañarte, te deja aquí
                qué ocurrió y qué hacer para mantenerte a salvo.
              </p>
            </div>
            <div className="head-actions">
              {pending.length > 0 ? (
                <form action={dispatchInterventionsAction}>
                  <button className="btn-op btn-op--primary" type="submit">
                    Marcar nuevos avisos como leídos ({pending.length})
                  </button>
                </form>
              ) : null}
            </div>
          </header>

          {items.length === 0 ? (
            <section className="user-hero">
              <div>
                <span className="chip chip--success">
                  <i className="dot dot--success" />
                  Todo en orden
                </span>
                <h2>No tienes avisos de seguridad pendientes</h2>
                <p>
                  Cuando SOVIR detecte un cobro sospechoso, presión por urgencia o una página
                  engañosa, aparecerá aquí explicado paso a paso.
                </p>
              </div>
            </section>
          ) : (
            <div className="entity-grid">
              {items.map((i) => {
                const d = describeIntervention(i);
                const isNew = i.state === "pending";
                const at = new Date(i.created_at_ms);
                return (
                  <article className="entity-card" key={i.intervention_id}>
                    <div className="entity-card-head">
                      <div>
                        <span className="panel-kicker">{timeAgo(i.created_at_ms, now)}</span>
                        <h3>{d.title}</h3>
                        <p>{d.what}</p>
                      </div>
                      <span className={`chip chip--${isNew ? "warning" : "success"}`}>
                        <i className={`dot dot--${isNew ? "warning" : "success"}`} />
                        {isNew ? "nuevo aviso" : "revisado"}
                      </span>
                    </div>

                    <ul className="kv-list">
                      <li>
                        <span>Recomendación</span>
                        <strong>{userAdviceFor(i.event_id)}</strong>
                      </li>
                      <li>
                        <span>Fecha y hora</span>
                        <strong>
                          {at.toLocaleDateString("es", { day: "numeric", month: "short" })} a las{" "}
                          {at.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                        </strong>
                      </li>
                    </ul>
                    <form action={sendEventFeedbackAction} className="form-row">
                      <input type="hidden" name="event_id" value={i.event_id} />
                      <span className="panel-kicker">
                        {labels.get(i.event_id)
                          ? labels.get(i.event_id) === "correct"
                            ? "Marcado como acierto — gracias"
                            : labels.get(i.event_id) === "false_positive"
                              ? "Marcado como falsa alarma — gracias"
                              : "¿Este aviso acertó?"
                          : "¿Este aviso acertó?"}
                      </span>
                      <button
                        className="btn-op"
                        type="submit"
                        name="verdict"
                        value="correct"
                        title="Sí, era una amenaza real"
                      >
                        Sí, acertó
                      </button>
                      <button
                        className="btn-op"
                        type="submit"
                        name="verdict"
                        value="false_positive"
                        title="No, era una falsa alarma"
                      >
                        Falsa alarma
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </ConsoleFrame>
    );
  }

  // =========================================================================
  // MODO TÉCNICO (DESARROLLADOR) — Kanban de 3 columnas + Tabla de auditoría
  // =========================================================================
  return (
    <ConsoleFrame current="/incidents">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className={`dot dot--${pending.length > 0 ? "warning" : "success"}`} />
              {pending.length > 0
                ? `${pending.length} intervenciones pendientes de despacho`
                : "Cola de intervenciones al día"}
            </p>
            <h1>Incidentes e Intervenciones</h1>
            <p className="page-head-sub">
              Cola operativa del motor de políticas (<code>dev-1</code>) y eventos base observados.
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
                + Emitir gancho→pago
              </button>
            </form>
            <form action={emitUiTreeObservation}>
              <button className="btn-op" type="submit">
                + Emitir UI_TREE
              </button>
            </form>
          </div>
        </header>

        <div className="kpi-grid">
          <section className="kpi-card kpi-card--amber">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>En cola</small>
                <strong>Pendientes</strong>
              </span>
              <span className="ep-badge ep-badge--inferred">pending</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">{pending.length}</p>
              <SegBar active={Math.min(5, pending.length)} total={5} tone="amber" />
            </div>
          </section>

          <section className="kpi-card kpi-card--sage">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Completadas</small>
                <strong>Entregadas</strong>
              </span>
              <span className="ep-badge ep-badge--verified">delivered</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">{delivered.length}</p>
              <SegBar active={Math.min(5, delivered.length)} total={5} tone="sage" />
            </div>
          </section>

          <section className="kpi-card kpi-card--slate">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Evidencia base</small>
                <strong>Eventos observados</strong>
              </span>
              <span className="ep-badge ep-badge--observed">Observado</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">{events.length}</p>
              <SegBar active={Math.min(5, events.length)} total={5} tone="brand" />
            </div>
          </section>

          <section className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Autorización</small>
                <strong>Total intervenciones</strong>
              </span>
              <span className="ep-badge ep-badge--policy">dev-1</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">{items.length}</p>
              <span className="ep-badge">{failedOrOther.length} fallidas</span>
            </div>
          </section>
        </div>

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
              <p className="empty">Sin alertas pendientes en cola.</p>
            ) : (
              <ul className="kanban-list">
                {pending.slice(0, 6).map((i) => {
                  const d = describeIntervention(i);
                  return (
                    <li className="kanban-card" key={i.intervention_id}>
                      <div className="kanban-card-top">
                        <strong>{d.title}</strong>
                        <span className="kanban-code">
                          {i.intervention_id.slice(0, 10).toUpperCase()}
                        </span>
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
                Entregadas
              </h2>
              <span className="kanban-count">{delivered.length}</span>
            </header>
            {delivered.length === 0 ? (
              <p className="empty">Ninguna intervención despachada aún.</p>
            ) : (
              <ul className="kanban-list">
                {delivered.slice(0, 6).map((i) => {
                  const d = describeIntervention(i);
                  return (
                    <li className="kanban-card" key={i.intervention_id}>
                      <div className="kanban-card-top">
                        <strong>{d.title}</strong>
                        <span className="kanban-code">
                          {i.intervention_id.slice(0, 10).toUpperCase()}
                        </span>
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
                Eventos observados
              </h2>
              <span className="kanban-count">{events.length}</span>
            </header>
            {events.length === 0 ? (
              <p className="empty">Sin eventos observados.</p>
            ) : (
              <ul className="kanban-list">
                {events.slice(0, 6).map((e) => (
                  <li className="kanban-card" key={e.event_id}>
                    <div className="kanban-card-top">
                      <strong>{e.modality}</strong>
                      <span className="kanban-code">{e.event_id.slice(0, 10).toUpperCase()}</span>
                    </div>
                    <p>{e.signals.join(" · ") || "sin señales"}</p>
                    {e.signals.length > 0 ? (
                      <form action={assessEventSignalsAction} className="form-row">
                        <input type="hidden" name="event_id" value={e.event_id} />
                        <input type="hidden" name="signals" value={e.signals.join(",")} />
                        <input type="hidden" name="privacy" value="standard" />
                        <SubmitButton label="Analizar con IA" pendingLabel="Analizando…" />
                      </form>
                    ) : null}
                    {e.signals.length > 0 ? (
                      <form action={explainEventAction} className="form-row">
                        <input type="hidden" name="event_id" value={e.event_id} />
                        <SubmitButton label="¿Por qué?" pendingLabel="Explicando…" />
                      </form>
                    ) : null}
                    {lastExplanation?.event_id === e.event_id ? (
                      <div className="entity-card" style={{ marginTop: "0.35rem" }} role="status">
                        <div className="entity-card-head">
                          <div>
                            <span className="panel-kicker">Explicación</span>
                            <h3>
                              {lastExplanation.ok && lastExplanation.explanation
                                ? lastExplanation.explanation.model_id
                                : "Explicación no disponible"}
                            </h3>
                          </div>
                          <span className={`chip chip--${lastExplanation.ok ? "success" : "warning"}`}>
                            <i className={`dot dot--${lastExplanation.ok ? "success" : "warning"}`} />
                            {lastExplanation.ok
                              ? lastExplanation.explanation?.provenance ?? ""
                              : lastExplanation.error ?? "503"}
                          </span>
                        </div>
                        {lastExplanation.ok && lastExplanation.explanation ? (
                          <p style={{ marginTop: "0.35rem" }}>
                            {lastExplanation.explanation.text}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {e.signals.length > 0 ? (
                      <form action={sendEventFeedbackAction} className="form-row">
                        <input type="hidden" name="event_id" value={e.event_id} />
                        <button
                          className="btn-op"
                          type="submit"
                          name="verdict"
                          value={labels.get(e.event_id) === "correct" ? "unsure" : "correct"}
                          title="Etiqueta el aviso como acertado para el eval"
                        >
                          {labels.get(e.event_id) === "correct" ? "✓ acertado" : "acertado"}
                        </button>
                        <button
                          className="btn-op"
                          type="submit"
                          name="verdict"
                          value={
                            labels.get(e.event_id) === "false_positive"
                              ? "unsure"
                              : "false_positive"
                          }
                          title="Etiqueta el aviso como falso positivo para el eval"
                        >
                          {labels.get(e.event_id) === "false_positive" ? "✓ falso+" : "falso pos."}
                        </button>
                      </form>
                    ) : null}
                    {lastInference?.event_id === e.event_id ? (
                      <div className="entity-card" style={{ marginTop: "0.35rem" }} role="status">
                        <div className="entity-card-head">
                          <div>
                            <span className="panel-kicker">
                              Hipótesis IA · {lastInference.privacy.toUpperCase()}
                            </span>
                            <h3>
                              {lastInference.ok && lastInference.verdict
                                ? `Veredicto de ${lastInference.verdict.model_id}`
                                : "Proveedor no disponible"}
                            </h3>
                          </div>
                          <span className={`chip chip--${lastInference.ok ? "success" : "warning"}`}>
                            <i className={`dot dot--${lastInference.ok ? "success" : "warning"}`} />
                            {lastInference.ok ? "evaluado" : lastInference.error ?? "503"}
                          </span>
                        </div>
                        {lastInference.ok && lastInference.verdict ? (
                          <ul className="kv-list">
                            <li>
                              <span>Hipótesis</span>
                              <strong>
                                {lastInference.verdict.hypotheses.map(describeHypothesis).join(", ") || "—"}
                              </strong>
                            </li>
                            <li>
                              <span>Confianza</span>
                              <strong>
                                {(lastInference.verdict.confidence_bp / 100).toFixed(1)}%
                              </strong>
                            </li>
                            <li>
                              <span>Provenance</span>
                              <strong>{lastInference.verdict.provenance}</strong>
                            </li>
                            {lastInference.verdict.votes?.length ? (
                              <li>
                                <span>Concilio</span>
                                <strong>
                                  {lastInference.verdict.votes
                                    .map(
                                      (v) =>
                                        `${v.voter} → ${v.hypotheses.map(describeHypothesis).join("+") || "—"} (${(v.confidence_bp / 100).toFixed(1)}%)`,
                                    )
                                    .join(" · ")}
                                </strong>
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="kanban-card-foot">
                      <SegBar
                        active={Math.min(5, Math.max(1, e.signals.length * 2))}
                        total={5}
                        tone="brand"
                      />
                      <time>{timeAgo(e.observed_at_ms, now)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="panel" aria-label="Tabla completa de intervenciones">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Registro técnico</p>
              <h2>Intervenciones ({items.length})</h2>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="empty">Sin intervenciones registradas.</p>
          ) : (
            <div className="op-table-wrap">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Evento origen</th>
                    <th>Tipo</th>
                    <th>Intentos</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const d = describeIntervention(i);
                    const tone =
                      i.state === "pending"
                        ? "warning"
                        : i.state === "delivered"
                          ? "success"
                          : "danger";
                    const at = new Date(i.created_at_ms);
                    return (
                      <tr key={i.intervention_id}>
                        <td>
                          <code>{i.intervention_id}</code>
                        </td>
                        <td>
                          <code>{i.event_id}</code>
                        </td>
                        <td>
                          <code>{i.kind}</code>
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
      </div>
    </ConsoleFrame>
  );
}
