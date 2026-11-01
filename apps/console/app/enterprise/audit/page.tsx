import { ConsoleFrame, requireApiSession } from "../../../components/ConsoleFrame";
import { listAudit } from "../../../lib/api";
import { live } from "../../../lib/live";
import { describeAudit } from "../../../lib/humanize";

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
            Todo lo que pasó con tus datos, en orden — quién entró, qué permiso se dio o se quitó,
            qué señal se observó y qué decidió el motor. Nada se edita ni se borra del rastro.
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
                {items.map((a) => {
                  const d = describeAudit(a);
                  return (
                    <li key={a.audit_id}>
                      <span className="row-stack">
                        <span>
                          {d.title} · {new Date(a.at_ms).toLocaleTimeString("es")}
                        </span>
                        {d.sub ? <span className="row-sub">{d.sub}</span> : null}
                        <span className="row-tech">{a.detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </ConsoleFrame>
  );
}
