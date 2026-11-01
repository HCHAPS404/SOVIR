import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { listDevices } from "../../lib/api";
import { live } from "../../lib/live";
import { registerDeviceAction } from "../../lib/actions";
import { describePlatform } from "../../lib/humanize";
import { getView } from "../../lib/view";

export const metadata = { title: "Dispositivos" };

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
          <section className="panel">
            <h2>Registrados ({devices.length})</h2>
            {devices.length === 0 ? (
              <p>Sin dispositivos. Vacío no significa protegido.</p>
            ) : (
              <ul className="rows">
                {devices.map((d) => (
                  <li key={d.device_id}>
                    <span className="row-stack">
                      <span>{d.label || describePlatform(d.platform)}</span>
                      <span className="row-sub">{describePlatform(d.platform)}</span>
                      {view === "dev" ? <span className="row-tech">{d.device_id}</span> : null}
                    </span>
                    <strong>{d.revoked_at_ms ? "inactivo" : "activo"}</strong>
                  </li>
                ))}
              </ul>
            )}
            <form action={registerDeviceAction} style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <input name="label" placeholder="Nombre (p. ej. Mi laptop)" aria-label="nombre" />
              <select name="platform" defaultValue="BROWSER_EXTENSION" aria-label="tipo">
                {["ANDROID", "IOS", "WINDOWS", "MACOS", "LINUX", "BROWSER_EXTENSION"].map((p) => (
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
        )}
      </div>
    </ConsoleFrame>
  );
}
