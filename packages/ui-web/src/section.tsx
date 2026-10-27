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

const data = catalog as {
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
      <h1>{view.title}</h1>
      <p className="lede">{view.lede}</p>
      {view.actions.length > 0 ? (
        <p className="actions">
          {view.actions.map((action, index) =>
            action.href ? (
              <a key={action.label} className={index === 0 ? "button" : "button secondary"} href={action.href}>
                {action.label}
              </a>
            ) : (
              <button key={action.label} type="button" className={index === 0 ? undefined : "secondary"}>
                {action.label}
              </button>
            ),
          )}
        </p>
      ) : null}
      <p className="note">{view.note}</p>
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
        <ul className="rows">
          {view.rows.map(([name, value]) => (
            <li key={name}>
              <span>{name}</span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
