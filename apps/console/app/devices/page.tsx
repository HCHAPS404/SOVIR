import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { listDevices } from "../../lib/api";
import { live } from "../../lib/live";
import { registerDeviceAction, revokeDeviceAction } from "../../lib/actions";
import { describePlatform } from "../../lib/humanize";
import { getView } from "../../lib/view";

export const metadata = { title: "Dispositivos" };

const deviceGlyphs: Record<string, string> = {
  monitor:
    "M4 5.5h16v10H4V5.5Zm5 13h6m-3-3v3",
  phone:
    "M9 4.5h6a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Zm2.5 12.5h1",
  puzzle:
    "M10 4.5v3H7v4h3v3h4v-3h3v-4h-3v-3h-4Z",
};

function DeviceIcon({ platform }: { platform: string }) {
  const kind =
    platform === "ANDROID" || platform === "IOS"
      ? "phone"
      : platform === "BROWSER_EXTENSION"
        ? "puzzle"
        : "monitor";
  return (
    <svg className="card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={deviceGlyphs[kind]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function DevicesPage() {
  await requireApiSession();
  const view = await getView();
  const devices = await live(listDevices);
  return (
    <ConsoleFrame current="/devices">
      <div className="desk">
        <header className="desk-head">
          <h1>Dispositivos</h1>
          <p>
            Los equipos y extensiones que pueden enviar señales a tu nombre. Si revocas uno, deja de
            contar para SOVIR al instante.
          </p>
        </header>
        {devices === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <>
            <section className="panel">
              <h2>Registrados ({devices.length})</h2>
              {devices.length === 0 ? (
                <p className="empty">
                  <strong>Sin dispositivos registrados.</strong> Registra este equipo o la extensión
                  del navegador para que puedan enviar señales.
                </p>
              ) : (
                <ul className="cards">
                  {devices.map((d) => {
                    const active = !d.revoked_at_ms;
                    return (
                      <li className="card" key={d.device_id}>
                        <DeviceIcon platform={d.platform} />
                        <span className="card-body">
                          <strong>{d.label || describePlatform(d.platform)}</strong>
                          <span className="card-sub">{describePlatform(d.platform)}</span>
                          {view === "dev" ? (
                            <span className="row-tech">{d.device_id}</span>
                          ) : null}
                        </span>
                        <span className="card-side">
                          <span className={`chip chip--${active ? "success" : "unknown"}`}>
                            <i className={`dot dot--${active ? "success" : "unknown"}`} />
                            {active ? "activo" : "inactivo"}
                          </span>
                          {active ? (
                            <form action={revokeDeviceAction}>
                              <input type="hidden" name="device_id" value={d.device_id} />
                              <button className="ghost" type="submit">
                                Revocar
                              </button>
                            </form>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2>Registrar un equipo</h2>
              <form action={registerDeviceAction} className="form-row">
                <input
                  name="label"
                  placeholder="Nombre (p. ej. Mi laptop)"
                  aria-label="nombre del equipo"
                />
                <select name="platform" defaultValue="BROWSER_EXTENSION" aria-label="tipo de equipo">
                  {["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS", "BROWSER_EXTENSION"].map((p) => (
                    <option key={p} value={p}>
                      {describePlatform(p)}
                    </option>
                  ))}
                </select>
                <button className="secondary" type="submit">
                  Registrar
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </ConsoleFrame>
  );
}
