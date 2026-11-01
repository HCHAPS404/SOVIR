import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import {
  enforceRetentionAction,
  mintLabConsent,
  mintObserverConsentAction,
  purgeDataAction,
  revokeConsentAction,
} from "../../lib/actions";
import { exportData } from "../../lib/api";
import { describeSource, grantStatus } from "../../lib/humanize";
import { live } from "../../lib/live";
import { getView } from "../../lib/view";

export const metadata = { title: "Permisos" };

function SegBar({
  active,
  total = 6,
  tone = "sage",
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

export default async function PermissionsPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const data = await live(exportData);
  const now = Date.now();

  const grants = data?.grants ?? [];
  const activeGrants = grants.filter((g) => !g.revoked && g.expires_at_ms > now);
  const inactiveGrants = grants.filter((g) => g.revoked || g.expires_at_ms <= now);
  const receiptsCount = data?.deletion_receipts?.length ?? 0;

  return (
    <ConsoleFrame current="/permissions">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i
                className={`dot dot--${activeGrants.length > 0 ? "success" : "warning"}`}
                aria-hidden="true"
              />
              {activeGrants.length > 0
                ? `${activeGrants.length} ${activeGrants.length === 1 ? "fuente autorizada" : "fuentes autorizadas"} · revocables en un clic`
                : "Modo fail-closed: ninguna fuente tiene permiso para enviar señales"}
            </p>
            <h1>Permisos y Gobernanza de Datos</h1>
            <p className="page-head-sub">
              Control explícito sobre qué fuente puede observar señales, con qué alcance del sistema
              operativo, durante cuánto tiempo y bajo qué política de retención.
            </p>
          </div>
          <div className="head-actions">
            <form action={mintLabConsent}>
              <button className="btn-op btn-op--primary" type="submit">
                + Autorizar fuente de laboratorio (24h)
              </button>
            </form>
            <form action={mintObserverConsentAction}>
              <button className="btn-op" type="submit">
                + Autorizar observador UI_TREE (24h)
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
            {/* Row 1 — 4 KPI Cards */}
            <div className="kpi-grid">
              <section className="kpi-card kpi-card--sage">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Consentimiento activo</small>
                    <strong>Permisos vigentes</strong>
                  </span>
                  <span className="ep-badge ep-badge--verified">Específico</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{activeGrants.length}</p>
                  <SegBar active={Math.min(6, activeGrants.length * 3)} tone="sage" />
                </div>
                <div className="kpi-foot">
                  <span>Validados en cada evento ingerido</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--copper">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Histórico</small>
                    <strong>Revocados o expirados</strong>
                  </span>
                  <span className="ep-badge">Inactivos</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{inactiveGrants.length}</p>
                  <span className="ep-badge">{grants.length} emitidos</span>
                </div>
                <div className="kpi-foot">
                  <span>Rechazados con error consent_required</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--slate">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Privacidad y red</small>
                    <strong>Egress a proveedores</strong>
                  </span>
                  <span className="ep-badge ep-badge--observed">Local-first</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">0 B</p>
                  <span className="ep-badge">record mode</span>
                </div>
                <div className="kpi-foot">
                  <span>Ningún contenido privado sale de tu equipo</span>
                </div>
              </section>

              <section className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Mínima retención</small>
                    <strong>Ventana de retención</strong>
                  </span>
                  <span className="ep-badge ep-badge--policy">30 días</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{receiptsCount}</p>
                  <span className="ep-badge">recibos de purga</span>
                </div>
                <div className="kpi-foot">
                  <span>Purga total disponible en cualquier momento</span>
                </div>
              </section>
            </div>

            {/* Row 2 — 2-Column Bento: Consent Grants Grid + Data Retention & Purge Controls */}
            <div className="bento-asym">
              <section className="panel" aria-label="Tarjetas de permisos">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">Invariante 1 · Consentimiento específico y revocable</p>
                    <h2>Permisos registrados ({grants.length})</h2>
                    <p>
                      Cada tarjeta detalla la fuente autorizada, el alcance del permiso OS, la
                      política interna y si existe envío a proveedores externos.
                    </p>
                  </div>
                </div>

                {grants.length === 0 ? (
                  <div className="entity-card">
                    <div className="entity-card-head">
                      <div>
                        <span className="panel-kicker">Cero observación por defecto</span>
                        <h3>Ningún permiso concedido todavía</h3>
                        <p>
                          Sin un permiso vigente, el motor rechaza cualquier señal entrante
                          (diseño fail-closed). Autoriza una fuente arriba si deseas probar el
                          análisis.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="entity-grid">
                    {grants.map((g) => {
                      const s = describeSource(g.source_id);
                      const state = g.revoked
                        ? "revoked"
                        : g.expires_at_ms <= now
                          ? "expired"
                          : "active";
                      const tone =
                        state === "active"
                          ? "success"
                          : state === "revoked"
                            ? "danger"
                            : "unknown";
                      return (
                        <article className="entity-card" key={g.grant_id}>
                          <div className="entity-card-head">
                            <div>
                              <span className="panel-kicker">Fuente: {g.source_id}</span>
                              <h3>{s.name}</h3>
                              <p>Puede {s.does}.</p>
                            </div>
                            <span className={`chip chip--${tone}`}>
                              <i className={`dot dot--${tone}`} />
                              {state === "active"
                                ? "activo"
                                : state === "revoked"
                                  ? "revocado"
                                  : "expirado"}
                            </span>
                          </div>

                          <ul className="kv-list">
                            <li>
                              <span>Autoridad OS</span>
                              <strong>Simulación local (sin captura OS)</strong>
                            </li>
                            <li>
                              <span>Política interna</span>
                              <strong>Solo señales tipadas (sin texto crudo)</strong>
                            </li>
                            <li>
                              <span>Proveedor remoto</span>
                              <strong>Ninguno (bloqueado en record)</strong>
                            </li>
                            <li>
                              <span>Estado de vigencia</span>
                              <strong>{grantStatus(g, now)}</strong>
                            </li>
                            {dev ? (
                              <li>
                                <span>Grant ID</span>
                                <strong>{g.grant_id}</strong>
                              </li>
                            ) : null}
                          </ul>

                          <div className="entity-card-foot">
                            <SegBar
                              active={state === "active" ? 6 : 0}
                              total={6}
                              tone={state === "active" ? "sage" : "copper"}
                            />
                            {state === "active" ? (
                              <form action={revokeConsentAction}>
                                <input type="hidden" name="grant_id" value={g.grant_id} />
                                <button className="btn-op btn-op--danger" type="submit">
                                  Revocar permiso
                                </button>
                              </form>
                            ) : (
                              <span className="ep-badge">Inactivo</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="bento-stack">
                <section className="panel" aria-label="Control de retención">
                  <div className="panel-head">
                    <div>
                      <p className="panel-kicker">Contrato POST /v1/me/retention · B16</p>
                      <h2>Política de mínima retención</h2>
                      <p>
                        Limpia eventos e intervenciones terminales con antigüedad mayor a la ventana
                        configurada (30 días por defecto).
                      </p>
                    </div>
                    <span className="ep-badge ep-badge--verified">30d TTL</span>
                  </div>
                  <ul className="kv-list">
                    <li>
                      <span>Eventos almacenados hoy</span>
                      <strong>{data.events.length}</strong>
                    </li>
                    <li>
                      <span>Intervenciones en historial</span>
                      <strong>{data.interventions.length}</strong>
                    </li>
                    <li>
                      <span>Contenido crudo / capturas</span>
                      <strong>0 (nunca se almacenan)</strong>
                    </li>
                  </ul>
                  <div className="head-actions">
                    <form action={enforceRetentionAction}>
                      <button className="btn-op" type="submit">
                        Ejecutar barrido de retención ahora
                      </button>
                    </form>
                  </div>
                </section>

                <section className="panel" aria-label="Supresión y purga verificable">
                  <div className="panel-head">
                    <div>
                      <p className="panel-kicker">Contrato DELETE /v1/me/data · B16</p>
                      <h2>Purga total de datos del principal</h2>
                      <p>
                        Elimina todos tus permisos, eventos e intervenciones en el motor local y
                        emite un recibo de borrado verificable en auditoría.
                      </p>
                    </div>
                    <span className="chip chip--danger">Acción destructiva</span>
                  </div>
                  <div className="head-actions">
                    <form action={purgeDataAction}>
                      <button className="btn-op btn-op--danger" type="submit">
                        Purgar todos mis datos ({data.events.length} eventos)
                      </button>
                    </form>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </ConsoleFrame>
  );
}
