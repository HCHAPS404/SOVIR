import { resolveSection, type CatalogSection } from "@sovir/ui-web/section";
import type { PatternState } from "@sovir/ui-web/patterns";

function Head({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="desk-head">
      <h1>{title}</h1>
      <p>{lede}</p>
    </header>
  );
}

function Stats({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="stat-strip">
      {rows.map(([name, value]) => (
        <div key={name}>
          <span>{name}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function grantState(state: PatternState) {
  if (state === "loading") return "En curso";
  if (state === "revoked") return "Revocado";
  if (state === "limited") return "Parcial";
  if (state === "offline") return "Sin red";
  if (state === "error") return "No disponible";
  return "No concedido";
}

export function SectionDesk({ section, state }: { section: CatalogSection; state: PatternState }) {
  const view = resolveSection(section, state);
  const path = section.path;

  return (
    <div className="desk">
      <Head title={view.title} lede={view.lede} />
      {path === "/protections" ? <Protections state={state} note={view.note} /> : null}
      {path === "/incidents" ? <Incidents rows={view.rows} blocks={view.blocks} note={view.note} /> : null}
      {path === "/investigations" ? <Investigations rows={view.rows} note={view.note} /> : null}
      {path === "/devices" ? <Devices rows={view.rows} note={view.note} /> : null}
      {path === "/permissions" ? <Permissions state={state} rows={view.rows} note={view.note} /> : null}
      {path === "/resources" ? <Resources rows={view.rows} note={view.note} /> : null}
      {path === "/account" ? <Account rows={view.rows} note={view.note} /> : null}
      {path === "/settings" ? <Settings rows={view.rows} note={view.note} /> : null}
      {path === "/enterprise/policies" ? <Policies rows={view.rows} note={view.note} /> : null}
      {path === "/enterprise/aggregates" ? <Aggregates rows={view.rows} note={view.note} /> : null}
      {path === "/enterprise/integrations" ? <Integrations rows={view.rows} note={view.note} /> : null}
      {path === "/enterprise/audit" ? <Audit rows={view.rows} note={view.note} /> : null}
      {path === "/enterprise/billing" ? <Billing rows={view.rows} note={view.note} /> : null}
    </div>
  );
}

function Protections({ state, note }: { state: PatternState; note: string }) {
  const status = grantState(state);
  const scopes = [
    ["Capturar", "Esta sesión. El diálogo lo abre el sistema, no esta consola.", "source_id + modality"],
    ["Enviar", "Salir del dispositivo es otra decisión. Un secreto no se acepta.", "sensitive_data_class"],
    ["Conservar", "Retención local por fuente. Hoy no hay un almacén.", "expires_at_ms"],
    ["Compartir", "Solo indicadores con umbral. No el texto de la pantalla.", "agregado"],
  ] as const;
  return (
    <>
      <p className="note">{note}</p>
      <div className="scope-grid">
        {scopes.map(([title, body, field]) => (
          <article className="scope-card" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
            <footer>
              <span>{status}</span>
              <small>{field}</small>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}

function Incidents({
  rows,
  blocks,
  note,
}: {
  rows: [string, string][];
  blocks: { heading: string; body: string }[];
  note: string;
}) {
  return (
    <>
      <Stats rows={rows} />
      <div className="record">
        <table className="record-table">
          <thead>
            <tr>
              <th>Lectura</th>
              <th>Contenido</th>
            </tr>
          </thead>
          <tbody>
            {blocks.length > 0 ? (
              blocks.map((block) => (
                <tr key={block.heading}>
                  <td>{block.heading}</td>
                  <td>{block.body}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="record-empty">
                  {note} Un evento futuro lleva identificador, fuente, modalidad y la concesión que lo autorizó.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Investigations({ rows, note }: { rows: [string, string][]; note: string }) {
  const steps = [
    ["Evento", "Solo si hubo una observación con concesión vigente."],
    ["Hipótesis", "Separada del hecho. No es una medición."],
    ["Verificación", "Externa. En este esqueleto no se ejecuta."],
    ["Costo", "Remoto: cero. No hay proveedor conectado."],
  ] as const;
  return (
    <>
      <Stats rows={rows} />
      <ol className="step-list">
        {steps.map(([title, body], index) => (
          <li key={title}>
            <span>{index + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="note">{note}</p>
    </>
  );
}

function Devices({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <>
      <Stats rows={rows} />
      <div className="record">
        <table className="record-table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Fuente</th>
              <th>Concesión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="record-empty">
                {note} Ninguna fila es una certificación del sistema.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Permissions({ state, rows, note }: { state: PatternState; rows: [string, string][]; note: string }) {
  const fields = [
    ["grant_id", "Ausente"],
    ["source_id", "Ausente"],
    ["expires_at_ms", "Sin vencimiento"],
    ["revoked", grantState(state)],
  ] as const;
  return (
    <>
      <Stats rows={rows} />
      <section className="panel">
        <h2>Concesión</h2>
        <dl className="field-grid">
          {fields.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>{note} Crear y revocar serán operaciones del backend. Esta pantalla no abre el diálogo del sistema.</p>
      </section>
    </>
  );
}

function Resources({ rows, note }: { rows: [string, string][]; note: string }) {
  const gates = [
    ["En el dispositivo", "Clasificación local. No gasta tokens remotos.", "Sin medición"],
    ["Reserva", "Cupo antes de salir del aparato.", "0"],
    ["Remoto", "Solo con política y un proveedor permitido.", "0"],
  ] as const;
  return (
    <>
      <Stats rows={rows} />
      <div className="scope-grid gates">
        {gates.map(([title, body, value]) => (
          <article className="scope-card" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
            <footer>
              <span>{value}</span>
            </footer>
          </article>
        ))}
      </div>
      <p className="note">{note} No hay una serie temporal: no hay uso que dibujar.</p>
    </>
  );
}

function Account({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <section className="panel">
      <h2>Sesión</h2>
      <Stats rows={rows} />
      <p>{note} No se inventa un nombre ni un correo.</p>
    </section>
  );
}

function Settings({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <section className="panel">
      <h2>Preferencias locales</h2>
      <ul className="rows">
        {rows.map(([name, value]) => (
          <li key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
      <p>{note} No hay un botón de guardar: nada de esto se escribe en un servidor.</p>
    </section>
  );
}

function Policies({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <>
      <Stats rows={rows} />
      <div className="record">
        <table className="record-table">
          <thead>
            <tr>
              <th>Regla</th>
              <th>Decisión</th>
              <th>Ámbito</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} className="record-empty">
                {note} Una regla futura solo puede observar, pedir revisión o advertir. No bloquea por una hipótesis.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Aggregates({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <>
      <Stats rows={rows} />
      <section className="panel">
        <h2>Umbral</h2>
        <p>
          {note} Un agregado no es una persona. No hay chats, ni un perfil, ni una fila por empleado.
        </p>
      </section>
    </>
  );
}

function Integrations({ rows, note }: { rows: [string, string][]; note: string }) {
  const ports = ["Dispositivo", "Concesión", "Evento observado"];
  return (
    <>
      <Stats rows={rows} />
      <ul className="port-list">
        {ports.map((port) => (
          <li key={port}>
            <strong>{port}</strong>
            <span>No enlazado</span>
          </li>
        ))}
      </ul>
      <p className="note">{note}</p>
    </>
  );
}

function Audit({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <>
      <Stats rows={rows} />
      <div className="record">
        <table className="record-table">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Acción</th>
              <th>Objeto</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="record-empty">
                {note} No se fabrican filas para llenar la bitácora.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Billing({ rows, note }: { rows: [string, string][]; note: string }) {
  return (
    <>
      <Stats rows={rows} />
      <section className="panel">
        <h2>Uso</h2>
        <p>{note} No hay plan, ni medio de pago, ni una curva de gasto.</p>
      </section>
    </>
  );
}
