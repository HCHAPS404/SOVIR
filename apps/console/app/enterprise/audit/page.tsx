import { ConsoleFrame, requireApiSession } from "../../../components/ConsoleFrame";
import { listAudit } from "../../../lib/api";
import { live } from "../../../lib/live";

export const metadata = { title: "Auditoría" };

export default async function AuditPage() {
  await requireApiSession();
  const items = await live((t) => listAudit(t, 100));
  return (
    <ConsoleFrame current="/enterprise/audit">
      <div className="desk">
        <header className="desk-head">
          <h1>Auditoría</h1>
          <p>
            Rastro unificado de acciones sensibles del principal actual (tombstones de metadatos —
            sobreviven al borrado por diseño).
          </p>
        </header>
        {items === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <section className="panel">
            <h2>Eventos de auditoría ({items.length})</h2>
            {items.length === 0 ? (
              <p>Sin acciones registradas todavía.</p>
            ) : (
              <ul className="rows">
                {items.map((a) => (
                  <li key={a.audit_id}>
                    <span>
                      <code>{a.action}</code> · {new Date(a.at_ms).toLocaleTimeString("es")}
                    </span>
                    <strong>{a.detail}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </ConsoleFrame>
  );
}
