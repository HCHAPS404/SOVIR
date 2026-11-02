import { cookies } from "next/headers";
import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import {
  assessInferenceAction,
  emitSequencePair,
  runInvestigationAction,
} from "../../lib/actions";
import { exportData, type InferenceVerdict, listInvestigations } from "../../lib/api";
import { timeAgo } from "../../lib/digest";
import { live } from "../../lib/live";
import { getView } from "../../lib/view";

export const metadata = { title: "Investigaciones" };

interface StoredInferenceResult {
  ok: boolean;
  privacy: "private" | "standard";
  signals: string[];
  at_ms: number;
  verdict?: InferenceVerdict;
  error?: string;
}

const PATTERN_LABELS: Record<string, { title: string; desc: string }> = {
  HOOK_THEN_PAYMENT: {
    title: "Secuencia gancho → solicitud de pago",
    desc: "Presión o urgencia detectada antes de pedir un pago en la misma ventana.",
  },
  HookThenPayment: {
    title: "Secuencia gancho → solicitud de pago",
    desc: "Presión o urgencia detectada antes de pedir un pago en la misma ventana.",
  },
  IDENTITY_THEN_CREDENTIAL: {
    title: "Identidad no verificada → solicitud de credenciales",
    desc: "Emisor sin verificar seguido de petición de contraseña o código.",
  },
  IdentityThenCredential: {
    title: "Identidad no verificada → solicitud de credenciales",
    desc: "Emisor sin verificar seguido de petición de contraseña o código.",
  },
  REPEATED_MANIPULATION: {
    title: "Manipulación repetida (≥3 señales distintas)",
    desc: "Acumulación de tácticas de presión, diseño engañoso o cargos ocultos.",
  },
  RepeatedManipulation: {
    title: "Manipulación repetida (≥3 señales distintas)",
    desc: "Acumulación de tácticas de presión, diseño engañoso o cargos ocultos.",
  },
};

function SegBar({
  active,
  total = 10,
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

export default async function InvestigationsPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const jar = await cookies();
  const rawLast = jar.get("sovir_last_inference")?.value;
  let lastInference: StoredInferenceResult | null = null;
  if (rawLast) {
    try {
      lastInference = JSON.parse(rawLast) as StoredInferenceResult;
    } catch {
      lastInference = null;
    }
  }

  const [investigations, data] = await Promise.all([
    live((t) => listInvestigations(t, 25)),
    live(exportData),
  ]);
  const now = Date.now();
  const latestInv = investigations && investigations.length > 0 ? investigations[0] : null;
  const totalFacts =
    investigations?.reduce((acc, inv) => acc + inv.facts.reduce((s, f) => s + f.count, 0), 0) ?? 0;
  const totalHypotheses =
    investigations?.reduce((acc, inv) => acc + inv.hypotheses.length, 0) ?? 0;

  return (
    <ConsoleFrame current="/investigations">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className="dot dot--brand" aria-hidden="true" />
              Separación estricta: Hechos observados vs Hipótesis inferidas (Invariante 6)
            </p>
            <h1>Investigaciones e Inferencia</h1>
            <p className="page-head-sub">
              Compara la heurística local determinista (modo Private, $0) frente al gateway remoto
              (modo Standard, fail-closed en modo record) y audita barridos de evidencia sobre tu
              ventana.
            </p>
          </div>
          <div className="head-actions">
            <form action={runInvestigationAction}>
              <input type="hidden" name="window_ms" value={3600000} />
              <button className="btn-op btn-op--primary" type="submit">
                Ejecutar barrido (1h)
              </button>
            </form>
            <form action={emitSequencePair}>
              <button className="btn-op" type="submit">
                + Emitir señales de prueba
              </button>
            </form>
          </div>
        </header>

        {/* Row 1 — 4 KPI Cards */}
        <div className="kpi-grid">
          <section className="kpi-card kpi-card--slate">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Evidencia probada</small>
                <strong>Hechos observados</strong>
              </span>
              <span className="ep-badge ep-badge--observed">Observado</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">{totalFacts}</p>
              <span className="ep-badge">{data?.events.length ?? 0} eventos</span>
            </div>
            <div className="kpi-foot">
              <span>Conteos verificables del registro local</span>
            </div>
          </section>

          <section className="kpi-card kpi-card--amber">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Patrones temporales</small>
                <strong>Hipótesis de secuencia</strong>
              </span>
              <span className="ep-badge ep-badge--inferred">Inferido</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">{totalHypotheses}</p>
              <span className="ep-badge">{investigations?.length ?? 0} barridos</span>
            </div>
            <div className="kpi-foot">
              <span>Pistas tipadas · nunca prueba de intención</span>
            </div>
          </section>

          <section className="kpi-card kpi-card--sage">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Motor local</small>
                <strong>Modo Private</strong>
              </span>
              <span className="ep-badge ep-badge--verified">Determinista</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">v0.2</p>
              <span className="ep-badge">0 ms red</span>
            </div>
            <div className="kpi-foot">
              <span>sovir-heuristic-local-0.2 · sin egress</span>
            </div>
          </section>

          <section className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-titles">
                <small>Presupuesto y egress</small>
                <strong>Gasto API / GPU</strong>
              </span>
              <span className="ep-badge">SOVIR_HTTP_EGRESS=record</span>
            </div>
            <div className="kpi-mid">
              <p className="kpi-num">$0.00</p>
              <span className="ep-badge">Fail-closed</span>
            </div>
            <div className="kpi-foot">
              <span>Standard devuelve 503 honesto sin red</span>
            </div>
          </section>
        </div>

        {/* Row 2 — 2-Column Bento: Inference Lab (Private vs Standard) + Deterministic Investigation */}
        <div className="bento-2col">
          <section className="panel" aria-label="Evaluador de inferencia">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Contrato POST /v1/inference/assess · ADR-0012</p>
                <h2>Evaluador de hipótesis: Private vs Standard</h2>
                <p>
                  Los modelos emiten únicamente hipótesis tipadas y nivel de confianza en puntos
                  base (0–10.000 bp). El motor de políticas decide acciones por separado.
                </p>
              </div>
              <span className="ep-badge ep-badge--inferred">Hipótesis tipadas</span>
            </div>

            <form action={assessInferenceAction} className="form-row">
              <select name="preset" defaultValue="phishing" aria-label="Escenario de señales">
                <option value="phishing">
                  Escenario 1: Solicitud de credenciales + Urgencia + Identidad no verificada
                </option>
                <option value="payment_scam">
                  Escenario 2: Solicitud de pago + Acción urgente + Identidad no verificada
                </option>
                <option value="dark_pattern">
                  Escenario 3: Patrón oscuro de consentimiento + Cargo oculto + Rastreo
                </option>
              </select>
              <select name="privacy" defaultValue="private" aria-label="Modo de privacidad">
                <option value="private">Modo Private — Heurística local ($0 · sin egress)</option>
                <option value="standard">
                  Modo Standard — Gateway remoto Meta (fail-closed en record)
                </option>
              </select>
              <button className="btn-op btn-op--primary" type="submit">
                Evaluar ahora
              </button>
            </form>

            {lastInference ? (
              <div className="entity-card" style={{ marginTop: "0.35rem" }}>
                <div className="entity-card-head">
                  <div>
                    <span className="panel-kicker">
                      Resultado en vivo · Modo {lastInference.privacy.toUpperCase()}
                    </span>
                    <h3>
                      {lastInference.ok && lastInference.verdict
                        ? `Veredicto de ${lastInference.verdict.model_id}`
                        : "Proveedor remoto bloqueado (Fail-Closed 503)"}
                    </h3>
                  </div>
                  <span
                    className={`chip chip--${lastInference.ok ? "success" : "warning"}`}
                  >
                    <i className={`dot dot--${lastInference.ok ? "success" : "warning"}`} />
                    {lastInference.ok ? "evaluado en local" : lastInference.error ?? "503"}
                  </span>
                </div>

                {lastInference.ok && lastInference.verdict ? (
                  <>
                    <ul className="kv-list">
                      <li>
                        <span>Hipótesis emitidas</span>
                        <strong>{lastInference.verdict.hypotheses.join(", ")}</strong>
                      </li>
                      <li>
                        <span>Confianza (basis points)</span>
                        <strong>
                          {lastInference.verdict.confidence_bp} bp (
                          {(lastInference.verdict.confidence_bp / 100).toFixed(1)}%)
                        </strong>
                      </li>
                      <li>
                        <span>Provenance verificable</span>
                        <strong>{lastInference.verdict.provenance}</strong>
                      </li>
                      {dev ? (
                        <li>
                          <span>Request ID</span>
                          <strong>{lastInference.verdict.request_id}</strong>
                        </li>
                      ) : null}
                    </ul>
                    <div className="entity-card-foot">
                      <span>Nivel de certeza heurística</span>
                      <SegBar
                        active={Math.round(lastInference.verdict.confidence_bp / 1000)}
                        total={10}
                        tone="amber"
                      />
                    </div>
                  </>
                ) : (
                  <p>
                    En modo <code>Standard</code> con <code>SOVIR_HTTP_EGRESS=record</code>, SOVIR
                    rehúsa salir a la red y devuelve <code>503 provider_unavailable</code> en lugar
                    de inventar una respuesta. Cero tokens consumidos.
                  </p>
                )}
              </div>
            ) : (
              <div className="entity-card" style={{ marginTop: "0.35rem" }}>
                <div className="entity-card-head">
                  <div>
                    <span className="panel-kicker">Listo para evaluar</span>
                    <h3>Selecciona un escenario y ejecuta el evaluador</h3>
                    <p>
                      Prueba primero en <strong>Modo Private</strong> para ver las hipótesis y
                      provenance de la heurística local, y luego en <strong>Modo Standard</strong>{" "}
                      para comprobar el bloqueo fail-closed sin gasto.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="panel" aria-label="Barrido determinista de evidencia">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Contrato POST /v1/investigations · ADR-0011</p>
                <h2>Investigador determinista de ventana</h2>
                <p>
                  Ordena tus eventos de forma canónica, extrae hechos probados y detecta secuencias
                  de escalamiento sin usar modelos externos.
                </p>
              </div>
              <span className="ep-badge ep-badge--observed">Determinista</span>
            </div>

            <form action={runInvestigationAction} className="form-row">
              <select name="window_ms" defaultValue="3600000" aria-label="Ventana temporal">
                <option value="900000">Ventana de 15 minutos</option>
                <option value="3600000">Ventana de 1 hora</option>
                <option value="86400000">Ventana de 24 horas</option>
              </select>
              <button className="btn-op btn-op--primary" type="submit">
                Correr investigación
              </button>
            </form>

            {latestInv ? (
              <div className="entity-card" style={{ marginTop: "0.35rem" }}>
                <div className="entity-card-head">
                  <div>
                    <span className="panel-kicker">
                      Último barrido · {timeAgo(latestInv.created_at_ms, now)}
                    </span>
                    <h3>{latestInv.events_examined} eventos examinados en la ventana</h3>
                  </div>
                  <span className="ep-badge ep-badge--observed">
                    {latestInv.facts.length} hechos · {latestInv.hypotheses.length} hipótesis
                  </span>
                </div>

                <ul className="kv-list">
                  {latestInv.facts.map((f, i) => (
                    <li key={`${f.kind}-${f.subject}-${i}`}>
                      <span>
                        [Hecho · {f.kind === "signal_observed" ? "Señal" : "Clase de dato"}]{" "}
                        {f.subject}
                      </span>
                      <strong>{f.count}×</strong>
                    </li>
                  ))}
                  {latestInv.facts.length === 0 ? (
                    <li>
                      <span>Hechos observados</span>
                      <strong>0 en esta ventana</strong>
                    </li>
                  ) : null}
                </ul>

                {latestInv.hypotheses.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    {latestInv.hypotheses.map((h, i) => {
                      const info = PATTERN_LABELS[h.pattern] ?? {
                        title: h.pattern,
                        desc: "Secuencia temporal detectada en la ventana.",
                      };
                      return (
                        <div
                          key={`${h.pattern}-${i}`}
                          style={{
                            padding: "0.5rem 0.65rem",
                            borderRadius: "8px",
                            background: "var(--surface)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <strong style={{ fontSize: "0.8rem", display: "block" }}>
                            [Hipótesis] {info.title}
                          </strong>
                          <small style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>
                            {info.desc} (intervalo: {h.span_ms} ms)
                          </small>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="entity-card" style={{ marginTop: "0.35rem" }}>
                <div className="entity-card-head">
                  <div>
                    <span className="panel-kicker">Sin barridos aún</span>
                    <h3>Ejecuta tu primera investigación</h3>
                    <p>
                      El investigador analizará los eventos de tu principal y separará los hechos
                      observados de las hipótesis de secuencia.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Row 3 — Historical Investigations Table */}
        <section className="panel" aria-label="Historial de investigaciones">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Registro de barridos</p>
              <h2>Historial de investigaciones ({investigations?.length ?? 0})</h2>
            </div>
          </div>
          {!investigations || investigations.length === 0 ? (
            <p className="empty">
              <strong>No hay investigaciones registradas todavía.</strong> Pulsa “Ejecutar barrido”
              arriba para generar un informe determinista sobre tus eventos.
            </p>
          ) : (
            <div className="op-table-wrap">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>ID / Orden</th>
                    <th>Eventos examinados</th>
                    <th>Hechos probados (Observed)</th>
                    <th>Hipótesis de secuencia (Inferred)</th>
                    <th>Ventana</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {investigations.map((inv, idx) => (
                    <tr key={inv.investigation_id}>
                      <td>
                        <code>
                          {dev
                            ? inv.investigation_id.slice(0, 12)
                            : `#${String(idx + 1).padStart(2, "0")}`}
                        </code>
                      </td>
                      <td>
                        <strong>{inv.events_examined}</strong> eventos
                      </td>
                      <td>
                        <span className="ep-badge ep-badge--observed">
                          {inv.facts.length} tipos ({inv.facts.reduce((s, f) => s + f.count, 0)}{" "}
                          marcas)
                        </span>
                      </td>
                      <td>
                        {inv.hypotheses.length > 0 ? (
                          <span className="ep-badge ep-badge--inferred">
                            {inv.hypotheses.map((h) => h.pattern).join(", ")}
                          </span>
                        ) : (
                          <span className="ep-badge">0 secuencias</span>
                        )}
                      </td>
                      <td>{Math.round(inv.window_ms / 60000)} min</td>
                      <td>{timeAgo(inv.created_at_ms, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ConsoleFrame>
  );
}
