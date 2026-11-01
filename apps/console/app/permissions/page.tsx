import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { exportData } from "../../lib/api";
import { live } from "../../lib/live";
import { mintLabConsent } from "../../lib/actions";
import { describeSource, grantStatus } from "../../lib/humanize";
import { getView } from "../../lib/view";

export const metadata = { title: "Permisos" };

export default async function PermissionsPage() {
  await requireApiSession();
  const view = await getView();
  const data = await live(exportData);
  const now = Date.now();
  return (
    <ConsoleFrame current="/permissions">
      <div className="desk">
        <header className="desk-head">
          <h1>Permisos</h1>
          <p>
            Quién puede observar tu actividad, qué puede hacer exactamente y hasta cuándo. Nada
            entra sin uno de estos permisos — y todos son revocables.
          </p>
        </header>
        {data === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <section className="panel">
            <h2>Permisos activos ({data.grants.length})</h2>
            {data.grants.length === 0 ? (
              <p className="empty">
                <strong>Ningún permiso concedido.</strong> Nada puede observarte todavía — concede
                uno solo si quieres probar la protección.
              </p>
            ) : (
              <ul className="rows">
                {data.grants.map((g) => {
                  const s = describeSource(g.source_id);
                  const state = g.revoked ? "revoked" : g.expires_at_ms <= now ? "expired" : "active";
                  return (
                    <li key={g.grant_id}>
                      <span className="row-stack">
                        <span>{s.name}</span>
                        <span className="row-sub">
                          Puede {s.does} · {grantStatus(g, now)}
                        </span>
                        {view === "dev" ? (
                          <span className="row-tech">
                            {g.source_id} · {g.grant_id}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`chip chip--${
                          state === "active" ? "success" : state === "revoked" ? "danger" : "unknown"
                        }`}
                      >
                        {state === "active" ? "activo" : state === "revoked" ? "revocado" : "expirado"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={mintLabConsent} style={{ marginTop: "1rem" }}>
              <button className="secondary" type="submit">
                Conceder consentimiento de laboratorio
              </button>
            </form>
          </section>
        )}
      </div>
    </ConsoleFrame>
  );
}
