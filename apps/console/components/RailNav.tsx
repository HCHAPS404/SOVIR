"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Item = { href: string; label: string };
type Group = { label: string; items: readonly Item[] };

const glyphs: Record<string, string> = {
  "/": "M4 11.2 12 4.5l8 6.7V20H4v-8.8Z",
  "/protections": "M12 3.5 19 6.4v5.2c0 4-2.7 6.9-7 8.4-4.3-1.5-7-4.4-7-8.4V6.4L12 3.5Z",
  "/incidents": "M12 8v5M12 16.5h.01M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
  "/investigations": "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm6.2.8 3.3 3.3",
  "/devices": "M7 4.5h10a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm4 13h2",
  "/permissions": "M8 11V8.2a4 4 0 0 1 8 0V11M7 11h10v8H7v-8Z",
  "/resources": "M5 16.5V8.2L12 4.5l7 3.7v8.3L12 20l-7-3.5Z",
  "/account": "M12 12.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM6.2 19.2a5.8 5.8 0 0 1 11.6 0",
  "/settings": "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 3.8v2.1M12 18.1v2.1M4.7 6.7l1.5 1.5M17.8 17.8l1.5 1.5M3.8 12h2.1M18.1 12h2.1M4.7 17.3l1.5-1.5M17.8 6.2l1.5-1.5",
  "/enterprise/policies": "M8 4.5h6l4 4V19.5H8v-15Zm6 0v4h4",
  "/enterprise/aggregates": "M5 8.5h6v11H5v-11Zm8-4h6v15h-6v-15Z",
  "/enterprise/integrations": "M8 12h8M9 8.5 5.5 12 9 15.5M15 8.5 18.5 12 15 15.5",
  "/enterprise/audit": "M7 5.5h10v13H7v-13Zm2.5 4h5M9.5 12.5h5M9.5 15.5h3",
  "/enterprise/billing": "M6 7.5h12v9H6v-9Zm0 3h12M8.5 7.5v-1.5M15.5 7.5v-1.5",
};

function NavGlyph({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={glyphs[href] ?? "M5 12h14"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RailNav({ groups, current }: { groups: readonly Group[]; current: string }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !q || item.label.toLocaleLowerCase("es").includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <>
      <label className="rail-find">
        <span>Buscar</span>
        <input
          type="search"
          value={query}
          placeholder="Buscar"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="rail-scroll">
        {visible.map((group) => (
          <div className="rail-group" key={group.label}>
            <h2>{group.label}</h2>
            <nav aria-label={group.label}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}>
                  <NavGlyph href={item.href} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        ))}
        {visible.length === 0 ? <p className="rail-empty">Ninguna sección</p> : null}
      </div>
    </>
  );
}
