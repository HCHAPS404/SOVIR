import { ConsoleFrame, requireApiSession } from "../../../components/ConsoleFrame";
import { listAudit } from "../../../lib/api";
import { live } from "../../../lib/live";
import { auditTone, describeAudit } from "../../../lib/humanize";
import { getView } from "../../../lib/view";

export const metadata = { title: "Auditoría" };

export default async function AuditPage() {
  await requireApiSession();
  const view = await getView();
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
              <p className="empty">
                <strong>Sin acciones registradas todavía.</strong> Cada sesión, permiso y señal
                quedará aquí en orden.
              </p>
            ) : (
              <ol className="timeline">
                {items.map((a) => {
                  const d = describeAudit(a);
                  const at = new Date(a.at_ms);
                  return (
                    <li key={a.audit_id}>
                      <i className={`dot dot--${auditTone(a.action)}`} aria-hidden="true" />
                      <span className="tl-body">
                        <strong>{d.title}</strong>
                        {d.sub ? <span className="tl-sub">{d.sub}</span> : null}
                        {view === "dev" ? <span className="row-tech">{a.detail}</span> : null}
                      </span>
                      <time dateTime={at.toISOString()}>
                        {at.toLocaleDateString("es", { day: "numeric", month: "short" })} ·{" "}
                        {at.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </div>
    </ConsoleFrame>
  );
}
