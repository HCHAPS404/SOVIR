import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import {
  connectThisDeviceAction,
  registerDeviceAction,
  revokeDeviceAction,
} from "../../lib/actions";
import { listDevices, whoami } from "../../lib/api";
import { describePlatform } from "../../lib/humanize";
import { live } from "../../lib/live";
import { getView } from "../../lib/view";

export const metadata = { title: "Dispositivos" };

const PLATFORM_MATRIX = [
  {
    code: "BROWSER_EXTENSION",
    name: "Extensión de navegador",
    auth: "Se vincula al iniciar sesión",
    sensor: "Extractor DOM local (host_permissions)",
    stage: "Disponible en repo (apps/extension)",
  },
  {
    code: "WINDOWS",
    name: "Windows Desktop",
    auth: "Token de sesión sellado por dispositivo",
    sensor: "Contrato UI_TREE / ADR-0014",
    stage: "Adaptador de señales listo",
  },
  {
    code: "ANDROID",
    name: "Android",
    auth: "Flujo autenticado por principal",
    sensor: "MediaProjection por sesión explícita",
    stage: "Especificado en plan maestro",
  },
  {
    code: "IOS",
    name: "iPhone / iPad",
    auth: "Flujo autenticado por principal",
    sensor: "System Broadcast Picker con indicador OS",
    stage: "Especificado en plan maestro",
  },
  {
    code: "MACOS",
    name: "macOS",
    auth: "Token de sesión sellado por dispositivo",
    sensor: "Screen Recording / Accessibility explícito",
    stage: "Especificado en plan maestro",
  },
  {
    code: "LINUX",
    name: "Linux (GNOME / KDE)",
    auth: "Token de sesión sellado por dispositivo",
    sensor: "XDG Desktop Portal ScreenCast",
    stage: "Especificado en plan maestro",
  },
] as const;

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

export default async function DevicesPage() {
  await requireApiSession();
  const view = await getView();
  const dev = view === "dev";
  const [devices, me] = await Promise.all([live(listDevices), live(whoami)]);

  const activeDevices = devices?.filter((d) => !d.revoked_at_ms) ?? [];
  const revokedDevices = devices?.filter((d) => Boolean(d.revoked_at_ms)) ?? [];

  return (
    <ConsoleFrame current="/devices">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i
                className={`dot dot--${activeDevices.length > 0 ? "success" : "warning"}`}
                aria-hidden="true"
              />
              {activeDevices.length > 0
                ? `${activeDevices.length} ${activeDevices.length === 1 ? "equipo vinculado" : "equipos vinculados"} a tu sesión`
                : "Sesión web activa · ningún sensor externo vinculado aún"}
            </p>
            <h1>Dispositivos y Superficies</h1>
            <p className="page-head-sub">
              Tus equipos aparecen aquí automáticamente cuando se autentican con tu sesión. Si
              revocas un dispositivo, el motor rechaza sus señales al instante.
            </p>
          </div>
          <div className="head-actions">
            <form action={connectThisDeviceAction}>
              <button className="btn-op btn-op--primary" type="submit">
                + Vincular este navegador a mi sesión
              </button>
            </form>
          </div>
        </header>

        {devices === null ? (
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
                    <small>Conectados</small>
                    <strong>Equipos activos</strong>
                  </span>
                  <span className="ep-badge ep-badge--verified">Autenticado</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{activeDevices.length}</p>
                  <SegBar active={Math.min(6, Math.max(1, activeDevices.length * 2))} tone="sage" />
                </div>
                <div className="kpi-foot">
                  <span>Autorizados a enviar señales con permiso</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--copper">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Bloqueados</small>
                    <strong>Equipos revocados</strong>
                  </span>
                  <span className="ep-badge">Corte inmediato</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">{revokedDevices.length}</p>
                  <span className="ep-badge">{devices.length} total</span>
                </div>
                <div className="kpi-foot">
                  <span>Rechazados en validación de ingesta</span>
                </div>
              </section>

              <section className="kpi-card kpi-card--slate">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Sesión actual</small>
                    <strong>Consola Web</strong>
                  </span>
                  <span className="ep-badge ep-badge--observed">Cookie httpOnly</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num">1</p>
                  <span className="ep-badge">{me?.device_id ?? "console-web"}</span>
                </div>
                <div className="kpi-foot">
                  <span>El token nunca se expone al JS del navegador</span>
                </div>
              </section>

              <section className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-titles">
                    <small>Aislamiento</small>
                    <strong>Espacio del principal</strong>
                  </span>
                  <span className="ep-badge ep-badge--policy">Tenant: {me?.tenant_id ?? "dev"}</span>
                </div>
                <div className="kpi-mid">
                  <p className="kpi-num" style={{ fontSize: "1.45rem" }}>
                    {me?.principal_id ?? "—"}
                  </p>
                </div>
                <div className="kpi-foot">
                  <span>Particionado por tenant + principal</span>
                </div>
              </section>
            </div>

            {/* Row 2 — 2-Column Bento: Connected Device Cards + Platform Coverage Matrix */}
            <div className="bento-asym">
              <section className="panel" aria-label="Equipos vinculados">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">Vinculación por autenticación</p>
                    <h2>Equipos registrados bajo tu identidad ({devices.length})</h2>
                    <p>
                      Cada cliente que inicia sesión queda sellado a tu principal y puede revocarse
                      individualmente.
                    </p>
                  </div>
                </div>

                {devices.length === 0 ? (
                  <div className="entity-card">
                    <div className="entity-card-head">
                      <div>
                        <span className="panel-kicker">Primer acceso</span>
                        <h3>Aún no hay equipos vinculados a tu cuenta</h3>
                        <p>
                          Cuando abres la extensión del navegador o la aplicación de escritorio e
                          inicias sesión, el equipo se emparenta automáticamente aquí. Puedes
                          vincular este navegador ahora mismo para probar el flujo completo.
                        </p>
                      </div>
                    </div>
                    <div className="entity-card-foot">
                      <span className="ep-badge">Autovinculación por sesión</span>
                      <form action={connectThisDeviceAction}>
                        <button className="btn-op btn-op--primary" type="submit">
                          Vincular este navegador
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div className="entity-grid">
                    {devices.map((d) => {
                      const active = !d.revoked_at_ms;
                      return (
                        <article className="entity-card" key={d.device_id}>
                          <div className="entity-card-head">
                            <div>
                              <span className="panel-kicker">{describePlatform(d.platform)}</span>
                              <h3>{d.label || describePlatform(d.platform)}</h3>
                            </div>
                            <span className={`chip chip--${active ? "success" : "unknown"}`}>
                              <i className={`dot dot--${active ? "success" : "unknown"}`} />
                              {active ? "activo" : "revocado"}
                            </span>
                          </div>
                          <ul className="kv-list">
                            <li>
                              <span>Plataforma</span>
                              <strong>{describePlatform(d.platform)}</strong>
                            </li>
                            <li>
                              <span>Origen de registro</span>
                              <strong>Sesión autenticada</strong>
                            </li>
                            <li>
                              <span>Estado de ingesta</span>
                              <strong>
                                {active ? "Permitido con consentimiento" : "Bloqueado"}
                              </strong>
                            </li>
                            {dev ? (
                              <li>
                                <span>Device ID</span>
                                <strong>{d.device_id}</strong>
                              </li>
                            ) : null}
                          </ul>
                          <div className="entity-card-foot">
                            <SegBar active={active ? 6 : 0} total={6} tone={active ? "sage" : "copper"} />
                            {active ? (
                              <form action={revokeDeviceAction}>
                                <input type="hidden" name="device_id" value={d.device_id} />
                                <button className="btn-op btn-op--danger" type="submit">
                                  Revocar equipo
                                </button>
                              </form>
                            ) : (
                              <span className="ep-badge">Desconectado</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="bento-stack">
                <section className="panel" aria-label="Matriz de plataformas">
                  <div className="panel-head">
                    <div>
                      <p className="panel-kicker">Arquitectura multiplataforma</p>
                      <h2>Cómo se emparentan las superficies de SOVIR</h2>
                      <p>
                        Ningún dispositivo captura en oculto: cada plataforma exige autenticación y
                        permiso explícito del sistema operativo.
                      </p>
                    </div>
                  </div>
                  <div className="op-table-wrap">
                    <table className="op-table">
                      <thead>
                        <tr>
                          <th>Superficie</th>
                          <th>Mecanismo de permiso</th>
                          <th>En tu sesión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PLATFORM_MATRIX.map((pm) => {
                          const linkedCount = activeDevices.filter(
                            (d) => d.platform === pm.code,
                          ).length;
                          return (
                            <tr key={pm.code}>
                              <td>
                                <div className="op-cell-stack">
                                  <strong>{pm.name}</strong>
                                  <small>{pm.auth}</small>
                                </div>
                              </td>
                              <td>
                                <div className="op-cell-stack">
                                  <span>{pm.sensor}</span>
                                  <small>{pm.stage}</small>
                                </div>
                              </td>
                              <td>
                                {linkedCount > 0 ? (
                                  <span className="chip chip--success">
                                    <i className="dot dot--success" />
                                    {linkedCount} activo{linkedCount > 1 ? "s" : ""}
                                  </span>
                                ) : (
                                  <span className="ep-badge">No vinculado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {dev ? (
                  <section className="panel" aria-label="Simulador de dispositivos para desarrollo">
                    <div className="panel-head">
                      <div>
                        <p className="panel-kicker">Solo en vista desarrollador</p>
                        <h2>Simular conexión de otra plataforma</h2>
                        <p>
                          Permite probar el contrato <code>POST /v1/devices</code> para cualquiera
                          de las 6 plataformas del esquema.
                        </p>
                      </div>
                    </div>
                    <form action={registerDeviceAction} className="form-row">
                      <input
                        name="label"
                        placeholder="Etiqueta de prueba (p. ej. Desktop Win11)"
                        aria-label="nombre del equipo"
                      />
                      <select
                        name="platform"
                        defaultValue="WINDOWS"
                        aria-label="tipo de equipo"
                      >
                        {["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS", "BROWSER_EXTENSION"].map(
                          (p) => (
                            <option key={p} value={p}>
                              {describePlatform(p)}
                            </option>
                          ),
                        )}
                      </select>
                      <button className="btn-op" type="submit">
                        Simular vinculación
                      </button>
                    </form>
                  </section>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </ConsoleFrame>
  );
}
