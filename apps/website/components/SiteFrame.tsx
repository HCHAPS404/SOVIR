import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import type { ReactNode } from "react";
import { nav, type PageCopy } from "../lib/content";

export function SiteFrame({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <p className="banner">Umbral. Sin métricas de producto.</p>
      <header className="topbar">
        <Link className="brand-lockup" href="/">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">SOVIR</span>
        </Link>
        <nav className="nav" aria-label="Secciones">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === current ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/sign-in">Entrar</Link>
          <Link href="/registro">Registro</Link>
        </nav>
        <ThemeSwitch />
      </header>
      <main id="contenido" className="content">
        {children}
      </main>
      <footer className="footer">
        <p>Nombre de trabajo. La consola está en otro origen y no se indexa desde aquí.</p>
      </footer>
    </>
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
