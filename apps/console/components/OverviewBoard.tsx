import Link from "next/link";
import { resolveSection, type CatalogSection } from "@sovir/ui-web/section";
import type { PatternState } from "@sovir/ui-web/patterns";

const nextSteps = [
  { href: "/devices", title: "Dispositivos", note: "Fuentes que el backend podrá registrar." },
  { href: "/permissions", title: "Permisos", note: "Captura de esta sesión, revocable. El sistema pide el permiso." },
  { href: "/resources", title: "Recursos", note: "Inferencia y presupuesto. En este demo el costo remoto es cero." },
  { href: "/enterprise/policies", title: "Políticas", note: "Reglas de organización, separadas de la cuenta personal." },
] as const;

export function OverviewBoard({ section, state }: { section: CatalogSection; state: PatternState }) {
  const view = resolveSection(section, state);

  return (
    <div className="desk">
      <header className="desk-head">
        <h1>Inicio</h1>
        <p>{view.lede}</p>
      </header>
      <div className="desk-grid">
        <section className="panel" aria-label="Esta sesión">
          <h2>Esta sesión</h2>
          {view.rows.length > 0 ? (
            <ul className="rows">
              {view.rows.map(([name, value]) => (
                <li key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>{view.note}</p>
          )}
        </section>
        <section className="panel">
          <h2>Conexión</h2>
          <p>{view.note || "No hay sensores conectados. Vacío no significa protegido."}</p>
          <Link className="text-link" href="/permissions">
            Revisar permisos
          </Link>
        </section>
      </div>
      <section className="panel">
        <h2>Por conectar</h2>
        <ul className="setup-list">
          {nextSteps.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.title}</Link>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
