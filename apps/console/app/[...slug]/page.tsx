import { PatternState } from "@sovir/ui-web/patterns";
import { findSection } from "@sovir/ui-web/section";
import { ConsoleFrame, requireApiSession } from "../../components/ConsoleFrame";
import { SectionDesk } from "../../components/SectionDesk";
import { states } from "../../lib/nav";

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ state?: string }>;
}) {
  await requireApiSession();
  const { slug } = await params;
  const query = await searchParams;
  const path = `/${slug.join("/")}`;
  const section = findSection(path);
  if (!section) {
    return (
      <ConsoleFrame current={path}>
        <h1>Ruta no definida</h1>
        <p>Esa sección no está en el catálogo del esqueleto.</p>
      </ConsoleFrame>
    );
  }
  const requested = query.state ?? "ready";
  const state = (states as readonly string[]).includes(requested)
    ? (requested as PatternState)
    : "ready";
  return (
    <ConsoleFrame current={path}>
      <SectionDesk section={section} state={state} />
    </ConsoleFrame>
  );
}
