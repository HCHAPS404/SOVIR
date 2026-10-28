import { PatternState } from "@sovir/ui-web/patterns";
import { findSection } from "@sovir/ui-web/section";
import { ConsoleFrame, requireDemoSession } from "../components/ConsoleFrame";
import { OverviewBoard } from "../components/OverviewBoard";
import { states } from "../lib/nav";

export const metadata = { title: "Inicio" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  await requireDemoSession();
  const query = await searchParams;
  const requested = query.state ?? "empty";
  const state = (states as readonly string[]).includes(requested)
    ? (requested as PatternState)
    : "empty";
  const section = findSection("inicio");
  if (!section) return null;
  return (
    <ConsoleFrame current="/">
      <OverviewBoard section={section} state={state} />
    </ConsoleFrame>
  );
}
