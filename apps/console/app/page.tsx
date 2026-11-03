import { ConsoleFrame, requireApiSession } from "../components/ConsoleFrame";
import { OverviewBoard } from "../components/OverviewBoard";
import { ApiDown, apiVersion, exportData, getBudget, getMetrics, whoami } from "../lib/api";
import { live } from "../lib/live";
import { getView } from "../lib/view";

export const metadata = { title: "Inicio" };

const METRIC_LABELS: Record<string, string> = {
  sovir_requests_total: "requests",
  sovir_events_ingested_total: "eventos",
  sovir_interventions_total: "intervenciones",
  sovir_sessions_issued_total: "sesiones",
  sovir_consents_granted_total: "grants",
  sovir_consents_revoked_total: "revocaciones",
  sovir_devices_registered_total: "dispositivos",
  sovir_rate_limited_total: "rate-limited",
  sovir_errors_5xx_total: "errores 5xx",
};

export default async function OverviewPage() {
  await requireApiSession();
  const view = await getView();
  const [me, data, version, budget, metrics] = await Promise.all([
    live(whoami),
    live(exportData),
    apiVersion().catch((e) => (e instanceof ApiDown ? null : Promise.reject(e))),
    live(getBudget).catch(() => null),
    view === "dev" ? live(getMetrics).catch(() => null) : Promise.resolve(null),
  ]);
  const backendDown = me === null;
  return (
    <ConsoleFrame current="/">
      <OverviewBoard
        me={me}
        data={data}
        version={version}
        backendDown={backendDown}
        budget={budget}
      />
      {view === "dev" && metrics ? (
        <section className="panel" aria-label="Contadores del backend" style={{ marginTop: "1rem" }}>
          <div className="panel-head">
            <div>
              <p className="panel-kicker">GET /v1/metrics · loopback-only · Prometheus exposition</p>
              <h2>Salud del backend (contadores en proceso)</h2>
            </div>
          </div>
          <ul className="kv-list">
            {Object.entries(METRIC_LABELS).map(([key, label]) => (
              <li key={key}>
                <span>{label}</span>
                <strong>{metrics[key] ?? 0}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ConsoleFrame>
  );
}
