import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { listInterventions } from "../../lib/api";
import { live } from "../../lib/live";
import { describeIntervention } from "../../lib/humanize";
import { getView } from "../../lib/view";

export const metadata = { title: "Incidentes" };

export default async function IncidentsPage() {
  await requireApiSession();
  const view = await getView();
  const items = await live((t) => listInterventions(t, 100));
  return (
    <ConsoleFrame current="/incidents">
      <div className="desk">
        <header className="desk-head">
          <h1>Incidentes</h1>
          <p>
            Cada vez que SOVIR decide protegerte de algo queda aquí — qué detectó, qué significó
            para ti y si el aviso llegó a mostrarse.
          </p>
        </header>
        {items === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <section className="panel">
            <h2>Intervenciones ({items.length})</h2>
            {items.length === 0 ? (
              <p className="empty">
                Aún no te ha protegido de nada — cuando SOVIR intervenga aparecerá aquí qué detectó
                y por qué. Puedes probarlo desde <a href="/">Inicio</a>.
              </p>
            ) : (
              <ul className="rows">
                {items.map((i) => {
                  const d = describeIntervention(i);
                  return (
                    <li key={i.intervention_id}>
                      <span className="row-stack">
                        <span>{d.title}</span>
                        <span className="row-sub">
                          {d.what} {new Date(i.created_at_ms).toLocaleTimeString("es")}
                        </span>
                        {view === "dev" ? (
                          <span className="row-tech">
                            {i.kind} · {i.event_id} · {i.intervention_id}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`chip chip--${
                          i.state === "pending"
                            ? "warning"
                            : i.state === "delivered"
                              ? "success"
                              : i.state === "failed"
                                ? "danger"
                                : "unknown"
                        }`}
                      >
                        {d.state}
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
