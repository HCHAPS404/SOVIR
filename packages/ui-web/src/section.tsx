import catalog from "./catalog.json";
import type { PatternState } from "./patterns";

export type Block = { heading: string; body: string };
export type Action = { label: string; href?: string };
export type CatalogSection = {
  id: string;
  path: string;
  group: string;
  label: string;
  title: string;
  lede: string;
  note: string;
  actions: Action[];
  rows: [string, string][];
  blocks: Block[];
  states: Record<string, Partial<Pick<CatalogSection, "title" | "lede" | "note" | "rows" | "blocks" | "actions">>>;
};

const data = catalog as unknown as {
  states: PatternState[];
  stateLabels: Record<string, string>;
  sections: CatalogSection[];
};

export const sectionCatalog = data.sections;
export const presentationStates = data.states;
export const stateLabels = data.stateLabels;

export function findSection(pathOrId: string) {
  return sectionCatalog.find((section) => section.path === pathOrId || section.id === pathOrId);
}

export function resolveSection(section: CatalogSection, state: PatternState) {
  if (state === "ready") return section;
  const override = section.states[state] ?? {};
  return {
    ...section,
    title: override.title || section.title,
    lede: override.lede || section.lede,
    note: override.note || section.note,
    rows: override.rows ?? [],
    blocks: override.blocks ?? [],
    actions: override.actions ?? [],
  };
}

export function SectionView({ section, state }: { section: CatalogSection; state: PatternState }) {
  const view = resolveSection(section, state);
  return (
    <article className="section-view">
      <header className="section-head">
        <div>
          <p className="kicker">{section.group}</p>
          <h1>{view.title}</h1>
          <p className="lede">{view.lede}</p>
        </div>
      </header>
      {view.note ? <p className="note">{view.note}</p> : null}
      {view.blocks.length > 0 ? (
        <div className="blocks">
          {view.blocks.map((block) => (
            <section key={block.heading}>
              <h2>{block.heading}</h2>
              <p>{block.body}</p>
            </section>
          ))}
        </div>
      ) : null}
      {view.rows.length > 0 ? (
        <div className="data-panel">
          <ul className="rows">
            {view.rows.map(([name, value]) => (
              <li key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
