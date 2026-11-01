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

export const metadata = { title: "Privacidad y permisos" };

export default async function PermissionsPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const data = await live(exportData);
  const now = Date.now();

  const grants = data?.grants ?? [];
  const activeGrants = grants.filter((g) => !g.revoked && g.expires_at_ms > now);
  const receiptsCount = data?.deletion_receipts?.length ?? 0;

  if (data === null) {
    return (
      <ConsoleFrame current="/permissions">
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
  // VISTA SENCILLA (CLIENTE) — Permisos claros + Privacidad en palabras simples
  // =========================================================================
  if (!dev) {
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
                  ? `Tienes ${activeGrants.length} ${activeGrants.length === 1 ? "permiso encendido" : "permisos encendidos"}`
                  : "Todos los permisos están apagados en este momento"}
              </p>
              <h1>Privacidad y permisos</h1>
              <p className="page-head-sub">
                SOVIR solo revisa lo que tú autorizas. Puedes apagar cualquier permiso cuando
                quieras o borrar todo tu historial con un solo clic.
              </p>
            </div>
            <div className="head-actions">
              <form action={mintLabConsent}>
                <button className="btn-op btn-op--primary" type="submit">
                  + Activar permiso de prueba (24 h)
                </button>
              </form>
            </div>
          </header>

          <div className="bento-asym">
            <section className="panel" aria-label="Tus permisos">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Tú tienes el control</p>
                  <h2>¿Qué tiene permiso para revisar SOVIR?</h2>
                  <p>Si quitas un permiso, SOVIR deja de recibir señales de esa fuente al instante.</p>
                </div>
              </div>

              {grants.length === 0 ? (
                <div className="entity-card">
                  <div className="entity-card-head">
                    <div>
                      <h3>No has activado ningún permiso todavía</h3>
                      <p>
                        Sin tu permiso, SOVIR no observa nada. Si quieres probar cómo te protege,
                        pulsa <strong>“Activar permiso de prueba”</strong> arriba.
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
                            <h3>{s.name}</h3>
                            <p>Puede {s.does}.</p>
                          </div>
                          <span className={`chip chip--${tone}`}>
                            <i className={`dot dot--${tone}`} />
                            {state === "active"
                              ? "encendido"
                              : state === "revoked"
                                ? "apagado"
                                : "vencido"}
                          </span>
                        </div>
                        <ul className="kv-list">
                          <li>
                            <span>Vigencia</span>
                            <strong>{grantStatus(g, now)}</strong>
                          </li>
                          <li>
                            <span>¿Sale de tu equipo?</span>
                            <strong>Nunca — todo se procesa aquí</strong>
                          </li>
                        </ul>
                        {state === "active" ? (
                          <div className="entity-card-foot">
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                              Puedes apagarlo cuando quieras
                            </span>
                            <form action={revokeConsentAction}>
                              <input type="hidden" name="grant_id" value={g.grant_id} />
                              <button className="btn-op btn-op--danger" type="submit">
                                Quitar permiso
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="panel" aria-label="Tus datos y privacidad">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Compromiso de privacidad</p>
                  <h2>Tus datos son solo tuyos</h2>
                </div>
              </div>
              <ul className="how-list">
                <li>
                  <i className="dot dot--success" aria-hidden="true" />
                  <div>
                    <strong>No guardamos tus contraseñas ni chats</strong>
                    <span>
                      SOVIR solo registra avisos de seguridad, nunca el contenido privado de tus
                      mensajes o cuentas.
                    </span>
                  </div>
                </li>
                <li>
                  <i className="dot dot--brand" aria-hidden="true" />
                  <div>
                    <strong>Borrado automático cada 30 días</strong>
                    <span>
                      Los avisos antiguos se limpian solos para no acumular historial innecesario.
                    </span>
                  </div>
                </li>
                <li>
                  <i className="dot dot--danger" aria-hidden="true" />
                  <div>
                    <strong>Borrar todo mi historial ahora</strong>
                    <span>
                      Si quieres dejar tu cuenta completamente en cero ({data.events.length}{" "}
                      registros actuales), puedes borrarlo todo al instante.
                    </span>
                  </div>
                </li>
              </ul>
              <div className="head-actions" style={{ marginTop: "auto" }}>
                <form action={purgeDataAction}>
                  <button className="btn-op btn-op--danger" type="submit">
                    Borrar todo mi historial ahora
                  </button>
                </form>
              </div>
            </section>
          </div>
        </div>
      </ConsoleFrame>
    );
  }

  // =========================================================================
  // MODO TÉCNICO (DESARROLLADOR) — Gobernanza completa B16 + Autoridad OS
  // =========================================================================
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
              Invariante 1 · Consentimiento específico por fuente ({activeGrants.length} activos)
            </p>
            <h1>Permisos y Gobernanza (Modo técnico)</h1>
            <p className="page-head-sub">
              Contratos <code>POST /v1/consents</code>, <code>POST /v1/me/retention</code> y{" "}
              <code>DELETE /v1/me/data</code>.
            </p>
          </div>
          <div className="head-actions">
            <form action={mintLabConsent}>
              <button className="btn-op btn-op--primary" type="submit">
                + Grant console-lab (24h)
              </button>
            </form>
            <form action={mintObserverConsentAction}>
              <button className="btn-op" type="submit">
                + Grant screen-observer:sim (24h)
              </button>
            </form>
          </div>
        </header>

        <div className="bento-asym">
          <section className="panel" aria-label="Tarjetas de permisos">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Grants del principal</p>
                <h2>Consent Grants ({grants.length})</h2>
              </div>
            </div>
            {grants.length === 0 ? (
              <p className="empty">Ningún grant emitido.</p>
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
                    state === "active" ? "success" : state === "revoked" ? "danger" : "unknown";
                  return (
                    <article className="entity-card" key={g.grant_id}>
                      <div className="entity-card-head">
                        <div>
                          <span className="panel-kicker">{g.source_id}</span>
                          <h3>{s.name}</h3>
                        </div>
                        <span className={`chip chip--${tone}`}>{state}</span>
                      </div>
                      <ul className="kv-list">
                        <li>
                          <span>Grant ID</span>
                          <strong>{g.grant_id}</strong>
                        </li>
                        <li>
                          <span>Autoridad OS</span>
                          <strong>Simulado en memoria</strong>
                        </li>
                        <li>
                          <span>Egress</span>
                          <strong>Bloqueado (record)</strong>
                        </li>
                        <li>
                          <span>Vigencia</span>
                          <strong>{grantStatus(g, now)}</strong>
                        </li>
                      </ul>
                      {state === "active" ? (
                        <div className="entity-card-foot">
                          <span className="ep-badge">Revocable</span>
                          <form action={revokeConsentAction}>
                            <input type="hidden" name="grant_id" value={g.grant_id} />
                            <button className="btn-op btn-op--danger" type="submit">
                              Revocar grant
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="bento-stack">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">POST /v1/me/retention · B16</p>
                  <h2>Retención (30 días)</h2>
                </div>
              </div>
              <form action={enforceRetentionAction}>
                <button className="btn-op" type="submit">
                  Ejecutar barrido de retención
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">DELETE /v1/me/data · Recibos: {receiptsCount}</p>
                  <h2>Purga verificable</h2>
                </div>
              </div>
              <form action={purgeDataAction}>
                <button className="btn-op btn-op--danger" type="submit">
                  Purgar datos del principal ({data.events.length} eventos)
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </ConsoleFrame>
  );
}
