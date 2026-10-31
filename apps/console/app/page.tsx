import { ConsoleFrame, requireApiSession } from "../components/ConsoleFrame";
import { OverviewBoard } from "../components/OverviewBoard";
import { ApiDown, apiVersion, exportData, whoami } from "../lib/api";
import { live } from "../lib/live";

export const metadata = { title: "Inicio" };

export default async function OverviewPage() {
  await requireApiSession();
  const [me, data, version] = await Promise.all([
    live(whoami),
    live(exportData),
    apiVersion().catch((e) => (e instanceof ApiDown ? null : Promise.reject(e))),
  ]);
  const backendDown = me === null;
  return (
    <ConsoleFrame current="/">
      <OverviewBoard me={me} data={data} version={version} backendDown={backendDown} />
    </ConsoleFrame>
  );
}
