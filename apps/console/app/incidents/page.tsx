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
              <ul className="cards">
                {items.map((i) => {
                  const d = describeIntervention(i);
                  const tone =
                    i.state === "pending"
                      ? "warning"
                      : i.state === "delivered"
                        ? "success"
                        : i.state === "failed"
                          ? "danger"
                          : "unknown";
                  const at = new Date(i.created_at_ms);
                  return (
                    <li className="card-item" key={i.intervention_id}>
                      <svg className="card-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 8v5M12 16.5h.01M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="card-body">
                        <strong>{d.title}</strong>
                        <span className="card-sub">
                          {d.what} · {at.toLocaleDateString("es", { day: "numeric", month: "short" })}{" "}
                          {at.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {view === "dev" ? (
                          <span className="row-tech">
                            {i.kind} · {i.event_id} · {i.intervention_id}
                          </span>
                        ) : null}
                      </span>
                      <span className="card-side">
                        <span className={`chip chip--${tone}`}>
                          <i className={`dot dot--${tone}`} />
                          {d.state}
                        </span>
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
