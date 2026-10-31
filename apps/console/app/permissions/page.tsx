import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { exportData } from "../../lib/api";
import { live } from "../../lib/live";
import { mintLabConsent } from "../../lib/actions";

export const metadata = { title: "Permisos" };

export default async function PermissionsPage() {
  await requireApiSession();
  const data = await live(exportData);
  const now = Date.now();
  return (
    <ConsoleFrame current="/permissions">
      <div className="desk">
        <header className="desk-head">
          <h1>Permisos</h1>
          <p>
            Consent grants vivos del principal. Cada uno es específico, acotado y revocable — el
            backend los exige antes de aceptar un evento.
          </p>
        </header>
        {data === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <section className="panel">
            <h2>Consent grants ({data.grants.length})</h2>
            {data.grants.length === 0 ? (
              <p>Sin grants. Concede el consentimiento de laboratorio desde aquí o desde Inicio.</p>
            ) : (
              <ul className="rows">
                {data.grants.map((g) => (
                  <li key={g.grant_id}>
                    <span>
                      {g.source_id} · <code>{g.grant_id}</code>
                    </span>
                    <strong>
                      {g.revoked
                        ? "revocado"
                        : g.expires_at_ms <= now
                          ? "expirado"
                          : `vigente hasta ${new Date(g.expires_at_ms).toLocaleString("es")}`}
                    </strong>
                  </li>
                ))}
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
