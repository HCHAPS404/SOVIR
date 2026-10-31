import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { listInterventions } from "../../lib/api";
import { live } from "../../lib/live";

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
            Intervenciones decididas por el motor de políticas. La decisión y{" "}
            <code>policy_version</code> de cada evento quedan en el audit trail.
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
                {items.map((i) => (
                  <li key={i.intervention_id}>
                    <span>
                      {i.kind} · {new Date(i.created_at_ms).toLocaleTimeString("es")} ·{" "}
                      <code>{i.event_id.slice(0, 16)}</code>
                    </span>
                    <strong>
                      {i.state} · {i.intervention_id.slice(0, 12)}
                    </strong>
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
