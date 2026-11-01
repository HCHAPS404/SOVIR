import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { exportData } from "../../lib/api";
import { live } from "../../lib/live";
import { mintLabConsent, revokeConsentAction } from "../../lib/actions";
import { describeSource, grantStatus } from "../../lib/humanize";
import { getView } from "../../lib/view";

export const metadata = { title: "Permisos" };

function LockIcon() {
  return (
    <svg className="card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 11V8.2a4 4 0 0 1 8 0V11M7 11h10v8H7v-8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function PermissionsPage() {
  await requireApiSession();
  const view = await getView();
  const data = await live(exportData);
  const now = Date.now();
  return (
    <ConsoleFrame current="/permissions">
      <div className="desk">
        <header className="desk-head">
          <h1>Permisos</h1>
          <p>
            Quién puede observar tu actividad, qué puede hacer exactamente y hasta cuándo. Nada
            entra sin uno de estos permisos — y todos son revocables.
          </p>
        </header>
        {data === null ? (
          <section className="panel">
            <h2>Sin conexión</h2>
            <p>La API dev no responde en 127.0.0.1:8787.</p>
          </section>
        ) : (
          <>
            <section className="panel">
              <h2>Concedidos ({data.grants.length})</h2>
              {data.grants.length === 0 ? (
                <p className="empty">
                  <strong>Ningún permiso concedido.</strong> Nada puede observarte todavía — concede
                  uno solo si quieres probar la protección.
                </p>
              ) : (
                <ul className="cards">
                  {data.grants.map((g) => {
                    const s = describeSource(g.source_id);
                    const state = g.revoked
                      ? "revoked"
                      : g.expires_at_ms <= now
                        ? "expired"
                        : "active";
                    return (
                      <li className="card" key={g.grant_id}>
                        <LockIcon />
                        <span className="card-body">
                          <strong>{s.name}</strong>
                          <span className="card-sub">
                            Puede {s.does} · {grantStatus(g, now)}
                          </span>
                          {view === "dev" ? (
                            <span className="row-tech">
                              {g.source_id} · {g.grant_id}
                            </span>
                          ) : null}
                        </span>
                        <span className="card-side">
                          <span
                            className={`chip chip--${
                              state === "active"
                                ? "success"
                                : state === "revoked"
                                  ? "danger"
                                  : "unknown"
                            }`}
                          >
                            <i
                              className={`dot dot--${
                                state === "active"
                                  ? "success"
                                  : state === "revoked"
                                    ? "danger"
                                    : "unknown"
                              }`}
                            />
                            {state === "active"
                              ? "activo"
                              : state === "revoked"
                                ? "revocado"
                                : "expirado"}
                          </span>
                          {state === "active" ? (
                            <form action={revokeConsentAction}>
                              <input type="hidden" name="grant_id" value={g.grant_id} />
                              <button className="ghost" type="submit">
                                Revocar
                              </button>
                            </form>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2>Conceder un permiso</h2>
              <p className="row-sub" style={{ marginBottom: "0.75rem" }}>
                En la demo solo existe la fuente de laboratorio — emite señales de prueba durante 24
                horas.
              </p>
              <form action={mintLabConsent}>
                <button className="secondary" type="submit">
                  Conceder consentimiento de laboratorio
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </ConsoleFrame>
  );
}
