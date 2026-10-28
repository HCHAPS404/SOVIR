import Link from "next/link";
import type { ReactNode } from "react";
import { footerColumns, type PageCopy } from "../lib/content";
import { FooterWave } from "./FooterWave";
import { Masthead } from "./SiteMenu";

export function SiteFrame({
  current,
  landing = false,
  children,
}: {
  current: string;
  landing?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={landing ? "site is-landing" : "site"}>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <Masthead current={current} />
      <main id="contenido" className="content">
        {children}
      </main>
      <footer className="footer">
        <div className="footer-grid">
          {footerColumns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="kicker">{column.heading}</p>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href} aria-current={link.href === current ? "page" : undefined}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-figure">
          <FooterWave />
          <div className="footer-end">
            <Link className="brand-lockup" href="/">
              <span className="mark" aria-hidden="true" />
              <span className="brand-name">SOVIR</span>
            </Link>
            <span className="footer-year">Sovir 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Article({ page }: { page: PageCopy }) {
  return (
    <article>
      <h1>{page.title}</h1>
      <p className="lede">{page.lede}</p>
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
