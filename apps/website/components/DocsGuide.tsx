import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFrame } from "./SiteFrame";

const tabs = [
  { href: "/docs", label: "Documentación" },
  { href: "/docs/privacidad", label: "Privacidad" },
  { href: "/docs/investigacion", label: "Investigación" },
  { href: "/docs/diseno", label: "Diseño" },
];

export function DocsGuide({
  current,
  title,
  lede,
  children,
}: {
  current: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <SiteFrame current={current}>
      <article className="docs">
        <p className="kicker">Guía de uso</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
        <nav className="docs-tabs" aria-label="Apartados de la guía">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} aria-current={tab.href === current ? "page" : undefined}>
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </article>
    </SiteFrame>
  );
}
