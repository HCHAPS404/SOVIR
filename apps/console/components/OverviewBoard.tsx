import Link from "next/link";
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
import { getView } from "../lib/view";
import { Sparkline } from "./Sparkline";

const tips = [
  {
    q: "1. Si algo te exige actuar “YA MISMO”",
    a: "Cuenta bloqueada, supuesto premio, multa o paquete retenido: la prisa artificial es el truco favorito del estafador para que no pienses. Detente y verifica por otro medio.",
  },
  {
    q: "2. Primero te asustan, luego te piden pagar",
    a: "Casi todas las estafas siguen el mismo orden: primero crean miedo o urgencia y enseguida te piden una transferencia o tarjeta. SOVIR detecta esa secuencia automáticamente.",
  },
  {
    q: "3. Nombres parecidos a tu banco o empresa",
    a: "Los impostores copian logotipos y usan direcciones casi idénticas a las oficiales. Si alguien te pide claves o códigos por mensaje, desconfía siempre.",
  },
  {
    q: "4. Botones diseñados para confundirte",
    a: "Páginas donde el botón de “Aceptar cobro” brilla y el de “Rechazar” está escondido, o casillas ya marcadas sin tu permiso. SOVIR te avisa cuando detecta estas trampas.",
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
              Tu protección está activa · Todo se analiza dentro de tu propio equipo
            </p>
            <h1>Hola, {nick}</h1>
            <p className="page-head-sub">
              SOVIR es tu asistente contra estafas digitales: te avisa cuando una página o mensaje
              intenta apurarte para que pagues o entregues tus datos personales.
            </p>
          </div>
          <div className="head-actions">
            {budget ? (
              <span className="chip" title="Gasto real de inferencia remota sobre el límite de tu plan">
                Gasto: ${budget.spent_usd.toFixed(2)} / ${budget.cap_usd.toFixed(2)}
              </span>
            ) : null}
            <form action={emitSequencePair}>
              <button className="btn-op btn-op--primary" type="submit">
                Hacer una prueba de estafa
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
                    ? "Avisos emitidos esta semana"
                    : "Sin amenazas detectadas"}
                </span>
                {digest.status === "protected" ? (
                  <>
                    <h2>
                      Esta semana te avisamos ante {digest.protectedCount}{" "}
                      {digest.protectedCount === 1
                        ? "intento sospechoso"
                        : "intentos sospechosos"}
                    </h2>
                    <p>
                      Detectamos tácticas de presión o solicitudes de pago dudosas
                      {digest.lastAlertAt
                        ? ` (el último aviso fue ${timeAgo(digest.lastAlertAt, now)})`
                        : ""}
                      . Debajo puedes ver tu actividad por día.
                    </p>
                  </>
                ) : digest.status === "quiet" ? (
                  <>
                    <h2>Todo está tranquilo esta semana</h2>
                    <p>
                      Revisamos {digest.signalCount}{" "}
                      {digest.signalCount === 1 ? "actividad" : "actividades"} y no encontramos
                      ningún intento de estafa ni cobro engañoso.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>SOVIR está listo para cuidarte</h2>
                    <p>
                      Aún no hay avisos registrados. Si quieres ver cómo funciona antes de que
                      ocurra algo real, pulsa <strong>“Hacer una prueba de estafa”</strong> arriba.
                    </p>
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

          <section className="panel" aria-label="Cómo funciona tu protección">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">En palabras simples</p>
                <h2>¿Cómo te cuida SOVIR?</h2>
              </div>
            </div>
            <ul className="how-list">
              <li>
                <i className="dot dot--success" aria-hidden="true" />
                <div>
                  <strong>1. Detecta trampas en el momento</strong>
                  <span>
                    Identifica cuando un sitio usa falsa urgencia, cobros escondidos o se hace
                    pasar por alguien más.
                  </span>
                </div>
              </li>
              <li>
                <i className="dot dot--brand" aria-hidden="true" />
                <div>
                  <strong>2. Nunca espía tu vida privada</strong>
                  <span>
                    Todo funciona dentro de tu dispositivo. No guardamos tus contraseñas, fotos ni
                    conversaciones.
                  </span>
                </div>
              </li>
              <li>
                <i
                  className={`dot dot--${activeGrants > 0 ? "success" : "warning"}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>3. Tú decides qué permisos están encendidos</strong>
                  <span>
                    Tienes <strong>{activeGrants}</strong>{" "}
                    {activeGrants === 1 ? "permiso activo" : "permisos activos"} y{" "}
                    <strong>{activeDevices}</strong>{" "}
                    {activeDevices === 1 ? "dispositivo vinculado" : "dispositivos vinculados"}.
                  </span>
                </div>
              </li>
            </ul>
            <div className="head-actions" style={{ marginTop: "auto" }}>
              <Link className="btn-op" href="/permissions">
                Ver mis permisos →
              </Link>
              <Link className="btn-op" href="/devices">
                Ver mis dispositivos →
              </Link>
            </div>
          </section>
        </div>

        {/* Segundo bloque: Qué detectamos + Guía rápida para no caer en trampas */}
        <div className="bento-2col">
          <section className="panel" aria-label="Lo que hemos detectado">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Motivos de aviso</p>
                <h2>¿Qué tipo de trampas hemos frenado?</h2>
                <p>Resumen en español claro de las señales sospechosas vistas esta semana.</p>
              </div>
              <Link className="btn-op" href="/incidents">
                Ver avisos ({data.interventions.length}) →
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
                <strong>Ninguna señal sospechosa todavía.</strong> Cuando SOVIR detecte un intento
                de engaño, aquí verás exactamente de qué tipo fue.
              </p>
            )}
          </section>

          <section className="panel" aria-label="Guía práctica contra estafas">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Consejos útiles</p>
                <h2>4 señales para reconocer una estafa al instante</h2>
                <p>Haz clic en cualquiera para leer cómo protegerte en el día a día.</p>
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
