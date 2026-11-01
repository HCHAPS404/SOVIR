import Link from "next/link";
import type { Principal, PrincipalDataExport } from "../lib/api";
import { emitSequencePair, emitUiTreeObservation, mintLabConsent } from "../lib/actions";
import { getView } from "../lib/view";
import { dailyBuckets, recentActivity, timeAgo, trendDelta, weeklyDigest } from "../lib/digest";
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

const nextSteps = [
  { href: "/devices", title: "Dispositivos", note: "Fuentes registradas vía API real." },
  { href: "/permissions", title: "Permisos", note: "Consent grants vivos, revocables por diseño." },
  { href: "/incidents", title: "Incidentes", note: "Intervenciones decididas por el motor de políticas." },
  { href: "/enterprise/audit", title: "Auditoría", note: "Rastro de acciones sensibles de esta sesión." },
] as const;

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
  const digest = data ? weeklyDigest(data) : null;
  const feed = data ? recentActivity(data) : [];
  const activityTrend = digest
    ? trendDelta(
        digest.protectedCount + digest.signalCount,
        digest.prevProtectedCount + digest.prevSignalCount,
      )
    : null;
  const nick = me?.principal_id.replace(/^console-/, "") ?? "…";
  const today = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="desk">
      <header className="desk-head">
        <h1>{dev ? "Inicio" : `Hola de nuevo, ${nick}`}</h1>
        <p>
          {dev
            ? "Estado real de la sesión contra la API dev local. Nada aquí es maqueta."
            : `${today} — así va tu protección, en palabras normales.`}
        </p>
      </header>
      {!dev && !backendDown ? (
        <div className="strip" role="status" aria-label="Estado de la protección">
          <span>
            <i className="dot dot--success" aria-hidden="true" /> Protección activa
          </span>
          <span>
            <i className="dot dot--unknown" aria-hidden="true" /> Todo queda en tu máquina
          </span>
          <span>
            {digest?.lastActivityAt
              ? `Última actividad ${timeAgo(digest.lastActivityAt)}`
              : "Sin actividad todavía"}
          </span>
        </div>
      ) : null}
      {backendDown ? (
        <section className="panel" aria-label="Sin conexión">
          <h2>Sin conexión</h2>
          <p>
            La API dev no responde en <code>SOVIR_API_URL</code> (por defecto{" "}
            <code>127.0.0.1:8787</code>). Arranca <code>cargo run -p sovir-api</code> y recarga.
          </p>
        </section>
      ) : !dev && digest && data ? (
        <>
          <div className="stat-grid">
            <section className="stat-card stat-hero">
              <div>
                <p className="kicker">Tu semana en seguridad</p>
                {digest.status === "protected" ? (
                  <>
                    <p className="stat-num">{digest.protectedCount}</p>
                    <p className="stat-note">
                      {digest.protectedCount === 1 ? "alerta de protección" : "alertas de protección"}
                      {digest.lastAlertAt ? ` — la última ${timeAgo(digest.lastAlertAt)}` : ""}
                    </p>
                  </>
                ) : digest.status === "quiet" ? (
                  <>
                    <p className="stat-num">{digest.signalCount}</p>
                    <p className="stat-note">
                      {digest.signalCount === 1 ? "señal observada" : "señales observadas"} — semana
                      tranquila, sin necesidad de alertarte
                    </p>
                  </>
                ) : (
                  <>
                    <p className="stat-num">0</p>
                    <p className="stat-note">
                      Aún sin actividad — cuando algo intente engañarte, aparecerá aquí
                    </p>
                  </>
                )}
                {activityTrend ? (
                  <span className={`trend trend--${activityTrend.tone}`}>
                    {activityTrend.label}
                  </span>
                ) : null}
              </div>
              <Sparkline
                values={dailyBuckets(
                  data.events.map((e) => e.observed_at_ms).concat(
                    data.interventions.map((i) => i.created_at_ms),
                  ),
                )}
              />
            </section>
            <section className="stat-card">
              <p className="kicker">Señales observadas</p>
              <p className="stat-num">{digest.signalCount}</p>
              <p className="stat-note">esta semana · {data.events.length} en total</p>
            </section>
            <section className="stat-card">
              <p className="kicker">Permisos activos</p>
              <p className="stat-num">{data.grants.filter((g) => !g.revoked).length}</p>
              <p className="stat-note">fuentes autorizadas a observarte</p>
            </section>
            <section className="stat-card">
              <p className="kicker">Dispositivos</p>
              <p className="stat-num">{data.devices.length}</p>
              <p className="stat-note">equipos registrados</p>
            </section>
          </div>
          <div className="desk-grid">
            <section className="panel">
              <h2>Qué se detectó esta semana</h2>
              {digest.categories.length > 0 ? (
                <ul className="bars">
                  {digest.categories.map((c) => (
                    <li key={c.label}>
                      <span className="bars-label">{c.label}</span>
                      <span className="bars-track" aria-hidden="true">
                        <span
                          className="bars-fill"
                          style={{
                            width: `${Math.max(
                              8,
                              Math.round((c.count / digest.categories[0].count) * 100),
                            )}%`,
                          }}
                        />
                      </span>
                      <strong className="bars-count">{c.count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">
                  Nada detectado todavía — aquí aparecerá el desglose por tipo de amenaza.
                </p>
              )}
            </section>
            <section className="panel">
              <h2>Actividad reciente</h2>
              {feed.length > 0 ? (
                <ul className="feed">
                  {feed.map((f, idx) => (
                    <li key={idx}>
                      <i
                        className={`dot ${f.kind === "alert" ? "dot--warning" : "dot--unknown"}`}
                        aria-hidden="true"
                      />
                      <span className="feed-body">
                        <strong>{f.title}</strong>
                        <span>{f.note}</span>
                      </span>
                      <time>{timeAgo(f.at)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">
                  Sin movimiento aún — las señales y alertas aparecerán aquí con su hora.
                </p>
              )}
            </section>
          </div>
          <section className="panel">
            <h2>Aprende a reconocer amenazas</h2>
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
        </>
      ) : (
        <div className="desk-grid">
          <section className="panel" aria-label="Esta sesión">
            <h2>Esta sesión</h2>
            <ul className="rows">
              <li>
                <span>Tú eres</span>
                <strong>{me?.principal_id}</strong>
              </li>
              {dev ? (
                <>
                  <li>
                    <span>Tenant</span>
                    <strong>{me?.tenant_id}</strong>
                  </li>
                  <li>
                    <span>Permisos de sesión</span>
                    <strong>{me?.scopes.join(", ")}</strong>
                  </li>
                  <li>
                    <span>API</span>
                    <strong>
                      v{version?.version} · {version?.contract}
                    </strong>
                  </li>
                </>
              ) : null}
            </ul>
          </section>
          <section className="panel">
            <h2>Datos del principal</h2>
            <ul className="rows">
              <li>
                <span>Permisos activos</span>
                <strong>{data?.grants.length ?? 0}</strong>
              </li>
              <li>
                <span>Señales observadas</span>
                <strong>{data?.events.length ?? 0}</strong>
              </li>
              <li>
                <span>Dispositivos</span>
                <strong>{data?.devices.length ?? 0}</strong>
              </li>
              <li>
                <span>Alertas de protección</span>
                <strong>{data?.interventions.length ?? 0}</strong>
              </li>
              <li>
                <span>Registro de actividad</span>
                <strong>{data?.audit_events.length ?? 0}</strong>
              </li>
            </ul>
            <Link className="text-link" href="/enterprise/audit">
              Ver auditoría
            </Link>
          </section>
        </div>
      )}
      <section className="panel">
        <h2>{dev ? "Laboratorio — probar el flujo API" : "Prueba cómo te protege SOVIR"}</h2>
        <p>
          {dev ? (
            <>
              Acciones reales contra el backend: consentimiento sintético, el par gancho→pago que
              produce un <code>HookThenPayment</code> con decisión <code>warn</code>, y una
              observación <code>UI_TREE</code> — el contrato exacto que usará un sensor de pantalla
              (ADR-0014).
            </>
          ) : (
            <>
              Tres acciones de demostración: concede un permiso, simula una estafa típica
              (presión→pago) para ver la alerta, y emite lo que vería un observador de pantalla.
              Nada sale de tu máquina.
            </>
          )}
        </p>
        <div className="lab-actions" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <form action={mintLabConsent}>
            <button className="secondary" type="submit">
              {dev ? "Conceder consentimiento de laboratorio" : "Dar permiso de demostración"}
            </button>
          </form>
          <form action={emitSequencePair}>
            <button className="secondary" type="submit">
              {dev ? "Emitir par gancho→pago" : "Simular una estafa (presión→pago)"}
            </button>
          </form>
          <form action={emitUiTreeObservation}>
            <button className="secondary" type="submit">
              {dev ? "Emitir observación UI_TREE" : "Simular observador de pantalla"}
            </button>
          </form>
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Después revisa <Link href="/incidents">Incidentes</Link> y{" "}
          <Link href="/enterprise/audit">Auditoría</Link>.
        </p>
      </section>
      <section className="panel">
        <h2>Superficies conectadas</h2>
        <ul className="setup-list">
          {nextSteps.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.title}</Link>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
