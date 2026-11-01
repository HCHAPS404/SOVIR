import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { listInterventions } from "../../lib/api";
import { live } from "../../lib/live";
import { describeIntervention } from "../../lib/humanize";

export const metadata = { title: "Incidentes" };

export default async function IncidentsPage() {
  await requireApiSession();
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
              <p>
                Sin intervenciones. Emite el par gancho→pago desde{" "}
                <a href="/">Inicio → Laboratorio</a> para ver una decisión <code>warn</code> real.
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
                        <span className="row-tech">
                          {i.kind} · {i.event_id} · {i.intervention_id}
                        </span>
                      </span>
                      <strong>{d.state}</strong>
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
