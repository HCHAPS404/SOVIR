import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { listDevices } from "../../lib/api";
import { live } from "../../lib/live";
import { registerDeviceAction } from "../../lib/actions";

export const metadata = { title: "Dispositivos" };

export default async function DevicesPage() {
  await requireApiSession();
  const devices = await live(listDevices);
  return (
    <ConsoleFrame current="/devices">
      <div className="desk">
        <header className="desk-head">
          <h1>Dispositivos</h1>
          <p>Registrados vía API real. Un dispositivo revocado no puede autenticar ni ingerir.</p>
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
                    <span>
                      {d.label} · {d.platform}
                    </span>
                    <strong>
                      {d.revoked_at_ms ? "revocado" : "activo"} · {d.device_id}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <form action={registerDeviceAction} style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <input name="label" placeholder="etiqueta" aria-label="etiqueta" />
              <select name="platform" defaultValue="BROWSER_EXTENSION" aria-label="plataforma">
                {["ANDROID", "IOS", "WINDOWS", "MACOS", "LINUX", "BROWSER_EXTENSION"].map((p) => (
                  <option key={p} value={p}>
                    {p}
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
