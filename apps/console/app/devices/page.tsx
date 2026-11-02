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

export const metadata = { title: "Mis dispositivos" };

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

export default async function DevicesPage() {
  await requireApiSession();
  const [devices, me] = await Promise.all([live(listDevices), live(whoami)]);
  const view = await getView(me?.is_admin);
  const dev = view === "dev";

  const activeDevices = devices?.filter((d) => !d.revoked_at_ms) ?? [];

  if (devices === null) {
    return (
      <ConsoleFrame current="/devices">
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
  // VISTA SENCILLA (CLIENTE) — Solo tus equipos reales, sin tablas de ingeniería
  // =========================================================================
  if (!dev) {
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
                  ? `${activeDevices.length} ${activeDevices.length === 1 ? "dispositivo conectado" : "dispositivos conectados"} a tu cuenta`
                  : "Aún no has vinculado ningún dispositivo"}
              </p>
              <h1>Mis dispositivos</h1>
              <p className="page-head-sub">
                Aquí aparecen tus navegadores, teléfonos o computadoras cuando inicias sesión en
                ellos. Si ya no usas alguno, puedes desconectarlo con un clic.
              </p>
            </div>
            <div className="head-actions">
              <form action={connectThisDeviceAction}>
                <button className="btn-op btn-op--primary" type="submit">
                  + Conectar este navegador
                </button>
              </form>
            </div>
          </header>

          {devices.length === 0 ? (
            <section className="user-hero">
              <div>
                <span className="chip chip--warning">
                  <i className="dot dot--warning" />
                  Ningún equipo vinculado todavía
                </span>
                <h2>Conecta este navegador para empezar</h2>
                <p>
                  No necesitas escribir nombres técnicos ni configurar nada a mano: cuando abres
                  SOVIR en un equipo o navegador y entras a tu cuenta, queda vinculado
                  automáticamente.
                </p>
              </div>
              <div>
                <form action={connectThisDeviceAction}>
                  <button className="btn-op btn-op--primary" type="submit">
                    Conectar este navegador ahora
                  </button>
                </form>
              </div>
            </section>
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
                        <p>
                          {active
                            ? "Conectado a tu cuenta y listo para avisarte ante estafas."
                            : "Desconectado — ya no envía información a tu cuenta."}
                        </p>
                      </div>
                      <span className={`chip chip--${active ? "success" : "unknown"}`}>
                        <i className={`dot dot--${active ? "success" : "unknown"}`} />
                        {active ? "conectado" : "desconectado"}
                      </span>
                    </div>
                    {active ? (
                      <div className="entity-card-foot">
                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          ¿Ya no usas este equipo?
                        </span>
                        <form action={revokeDeviceAction}>
                          <input type="hidden" name="device_id" value={d.device_id} />
                          <button className="btn-op btn-op--danger" type="submit">
                            Desconectar
                          </button>
                        </form>
                      </div>
                    ) : null}
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
  // MODO TÉCNICO (DESARROLLADOR) — Tarjetas + Matriz multiplataforma + Simulador
  // =========================================================================
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
              Principal: {me?.principal_id} · Tenant: {me?.tenant_id}
            </p>
            <h1>Dispositivos y Superficies (Modo técnico)</h1>
            <p className="page-head-sub">
              Registro de clientes autenticados (<code>POST /v1/devices</code>) y matriz de
              adaptadores de plataforma.
            </p>
          </div>
          <div className="head-actions">
            <form action={connectThisDeviceAction}>
              <button className="btn-op btn-op--primary" type="submit">
                + Vincular este navegador
              </button>
            </form>
          </div>
        </header>

        <div className="bento-asym">
          <section className="panel" aria-label="Equipos vinculados">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">GET /v1/devices</p>
                <h2>Equipos registrados ({devices.length})</h2>
              </div>
            </div>
            {devices.length === 0 ? (
              <p className="empty">Ningún dispositivo registrado aún para este principal.</p>
            ) : (
              <div className="entity-grid">
                {devices.map((d) => {
                  const active = !d.revoked_at_ms;
                  return (
                    <article className="entity-card" key={d.device_id}>
                      <div className="entity-card-head">
                        <div>
                          <span className="panel-kicker">{d.platform}</span>
                          <h3>{d.label || describePlatform(d.platform)}</h3>
                        </div>
                        <span className={`chip chip--${active ? "success" : "unknown"}`}>
                          <i className={`dot dot--${active ? "success" : "unknown"}`} />
                          {active ? "activo" : "revocado"}
                        </span>
                      </div>
                      <ul className="kv-list">
                        <li>
                          <span>Device ID</span>
                          <strong>{d.device_id}</strong>
                        </li>
                        <li>
                          <span>Plataforma</span>
                          <strong>{describePlatform(d.platform)}</strong>
                        </li>
                        <li>
                          <span>Última actividad</span>
                          <strong>
                            {d.last_seen_at_ms
                              ? new Date(d.last_seen_at_ms).toLocaleString()
                              : "sin señales aún"}
                          </strong>
                        </li>
                      </ul>
                      {active ? (
                        <div className="entity-card-foot">
                          <span className="ep-badge">Activo</span>
                          <form action={revokeDeviceAction}>
                            <input type="hidden" name="device_id" value={d.device_id} />
                            <button className="btn-op btn-op--danger" type="submit">
                              Revocar
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
            <section className="panel" aria-label="Matriz de plataformas">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Arquitectura multiplataforma</p>
                  <h2>Estado de adaptadores por SO</h2>
                </div>
              </div>
              <div className="op-table-wrap">
                <table className="op-table">
                  <thead>
                    <tr>
                      <th>Superficie</th>
                      <th>Permiso / Contrato</th>
                      <th>En sesión</th>
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
                              <span className="chip chip--success">{linkedCount} activo</span>
                            ) : (
                              <span className="ep-badge">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel" aria-label="Simulador de dispositivos">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Harness de prueba</p>
                  <h2>Simular registro por plataforma</h2>
                </div>
              </div>
              <form action={registerDeviceAction} className="form-row">
                <input
                  name="label"
                  placeholder="Etiqueta (p. ej. Desktop Win11)"
                  aria-label="nombre del equipo"
                />
                <select name="platform" defaultValue="WINDOWS" aria-label="tipo de equipo">
                  {["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS", "BROWSER_EXTENSION"].map((p) => (
                    <option key={p} value={p}>
                      {describePlatform(p)}
                    </option>
                  ))}
                </select>
                <button className="btn-op" type="submit">
                  Registrar
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </ConsoleFrame>
  );
}
