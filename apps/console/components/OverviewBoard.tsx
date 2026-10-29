import Link from "next/link";
import type { Principal, PrincipalDataExport } from "../lib/api";
import { emitSequencePair, mintLabConsent } from "../lib/actions";

const nextSteps = [
  { href: "/devices", title: "Dispositivos", note: "Fuentes registradas vía API real." },
  { href: "/permissions", title: "Permisos", note: "Consent grants vivos, revocables por diseño." },
  { href: "/incidents", title: "Incidentes", note: "Intervenciones decididas por el motor de políticas." },
  { href: "/enterprise/audit", title: "Auditoría", note: "Rastro de acciones sensibles de esta sesión." },
] as const;

export function OverviewBoard({
  me,
  data,
  version,
  backendDown,
}: {
  me: Principal | null;
  data: PrincipalDataExport | null;
  version: { version: string; contract: string; build_sha: string } | null;
  backendDown: boolean;
}) {
  return (
    <div className="desk">
      <header className="desk-head">
        <h1>Inicio</h1>
        <p>Estado real de la sesión contra la API dev local. Nada aquí es maqueta.</p>
      </header>
      {backendDown ? (
        <section className="panel" aria-label="Sin conexión">
          <h2>Sin conexión</h2>
          <p>
            La API dev no responde en <code>SOVIR_API_URL</code> (por defecto{" "}
            <code>127.0.0.1:8787</code>). Arranca <code>cargo run -p sovir-api</code> y recarga.
          </p>
        </section>
      ) : (
        <div className="desk-grid">
          <section className="panel" aria-label="Esta sesión">
            <h2>Esta sesión</h2>
            <ul className="rows">
              <li>
                <span>Principal</span>
                <strong>{me?.principal_id}</strong>
              </li>
              <li>
                <span>Tenant</span>
                <strong>{me?.tenant_id}</strong>
              </li>
              <li>
                <span>Scopes</span>
                <strong>{me?.scopes.join(", ")}</strong>
              </li>
              <li>
                <span>API</span>
                <strong>
                  v{version?.version} · {version?.contract}
                </strong>
              </li>
            </ul>
          </section>
          <section className="panel">
            <h2>Datos del principal</h2>
            <ul className="rows">
              <li>
                <span>Consent grants</span>
                <strong>{data?.grants.length ?? 0}</strong>
              </li>
              <li>
                <span>Eventos</span>
                <strong>{data?.events.length ?? 0}</strong>
              </li>
              <li>
                <span>Dispositivos</span>
                <strong>{data?.devices.length ?? 0}</strong>
              </li>
              <li>
                <span>Intervenciones</span>
                <strong>{data?.interventions.length ?? 0}</strong>
              </li>
              <li>
                <span>Audit trail</span>
                <strong>{data?.audit_events.length ?? 0}</strong>
              </li>
            </ul>
            <Link className="text-link" href="/enterprise/audit">
              Ver auditoría
            </Link>
          </section>
        </div>
      )}
      <section className="panel">
        <h2>Laboratorio — probar el flujo API</h2>
        <p>
          Dos acciones reales contra el backend: consentimiento sintético y el par gancho→pago que
          produce un <code>HookThenPayment</code> con decisión <code>warn</code>.
        </p>
        <div className="lab-actions" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <form action={mintLabConsent}>
            <button className="secondary" type="submit">
              Conceder consentimiento de laboratorio
            </button>
          </form>
          <form action={emitSequencePair}>
            <button className="secondary" type="submit">
              Emitir par gancho→pago
            </button>
          </form>
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Después revisa <Link href="/incidents">Incidentes</Link> y{" "}
          <Link href="/enterprise/audit">Auditoría</Link>.
        </p>
      </section>
      <section className="panel">
        <h2>Superficies conectadas</h2>
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
