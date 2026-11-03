import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { SubmitButton } from "../../components/SubmitButton";
import { registerWebhookAction, revokeWebhookAction } from "../../lib/actions";
import { listWebhooks } from "../../lib/api";
import { timeAgo } from "../../lib/digest";
import { live } from "../../lib/live";
import { getView } from "../../lib/view";

export const metadata = { title: "Webhooks" };

const KIND_LABEL: Record<string, string> = {
  notify: "Aviso ambiental",
  warn_banner: "Banner de advertencia",
  require_review: "Revisión obligatoria",
};

export default async function WebhooksPage() {
  await requireApiSession();
  const view = await getView();
  const endpoints = (await live(listWebhooks)) ?? [];
  const now = Date.now();
  const active = endpoints.filter((e) => !e.revoked_at_ms);
  const revoked = endpoints.filter((e) => e.revoked_at_ms);

  return (
    <ConsoleFrame current="/webhooks">
      <div className="desk">
        <header className="page-head">
          <div className="page-head-title">
            <p className="live-kicker">
              <i className={`dot dot--${active.length > 0 ? "success" : "warning"}`} />
              {active.length > 0
                ? `${active.length} ${active.length === 1 ? "endpoint activo" : "endpoints activos"}`
                : "Sin endpoints registrados"}
            </p>
            <h1>Webhooks de intervención</h1>
            <p className="page-head-sub">
              Endpoints HTTPS que reciben entregas firmadas cuando el motor de políticas emite una
              intervención. El host debe estar en la allowlist de egress del servidor.
            </p>
          </div>
        </header>

        {view === "dev" ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Nuevo endpoint</p>
                <h2>Registrar webhook</h2>
              </div>
            </div>
            <form action={registerWebhookAction} className="form-stack">
              <label className="field">
                <span>URL del endpoint (HTTPS)</span>
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://mi-servidor.example/sovir/hook"
                />
              </label>
              <fieldset className="field">
                <span>Tipos de intervención</span>
                {Object.entries(KIND_LABEL).map(([v, label]) => (
                  <label key={v} className="check">
                    <input type="checkbox" name="kinds" value={v} defaultChecked={v === "notify"} />
                    {label} <code>{v}</code>
                  </label>
                ))}
              </fieldset>
              <SubmitButton label="Registrar endpoint" pendingLabel="Registrando…" />
              <p className="empty">
                El secreto de firma se muestra una sola vez en la respuesta de registro — guárdalo
                en un gestor de secretos. Las entregas se firman con HMAC.
              </p>
            </form>
          </section>
        ) : null}

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Registro</p>
              <h2>Endpoints ({endpoints.length})</h2>
            </div>
          </div>
          {endpoints.length === 0 ? (
            <p className="empty">
              Sin endpoints registrados. Registra uno para recibir intervenciones firmadas en tu
              servidor.
            </p>
          ) : (
            <div className="entity-grid">
              {endpoints.map((e) => {
                const dead = Boolean(e.revoked_at_ms);
                return (
                  <article className="entity-card" key={e.endpoint_id}>
                    <div className="entity-card-head">
                      <div>
                        <span className="panel-kicker">{timeAgo(e.created_at_ms, now)}</span>
                        <h3 style={{ wordBreak: "break-all" }}>{e.url}</h3>
                      </div>
                      <span className={`chip chip--${dead ? "slate" : "success"}`}>
                        <i className={`dot dot--${dead ? "slate" : "success"}`} />
                        {dead ? "revocado" : "activo"}
                      </span>
                    </div>
                    <ul className="kv-list">
                      <li>
                        <span>ID</span>
                        <strong>
                          <code>{e.endpoint_id}</code>
                        </strong>
                      </li>
                      <li>
                        <span>Suscripciones</span>
                        <strong>
                          {e.kinds.map((k) => KIND_LABEL[k] ?? k).join(" · ") || "—"}
                        </strong>
                      </li>
                      {dead ? (
                        <li>
                          <span>Revocado</span>
                          <strong>{timeAgo(e.revoked_at_ms ?? 0, now)}</strong>
                        </li>
                      ) : null}
                    </ul>
                    {!dead ? (
                      <form action={revokeWebhookAction} className="form-row">
                        <input type="hidden" name="endpoint_id" value={e.endpoint_id} />
                        <button className="btn-op btn-op--danger" type="submit">
                          Revocar endpoint
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
          {revoked.length > 0 ? (
            <p className="empty">{revoked.length} endpoint(s) revocado(s) conservados como registro.</p>
          ) : null}
        </section>
      </div>
    </ConsoleFrame>
  );
}
