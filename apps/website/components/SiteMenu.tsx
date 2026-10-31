"use client";

import { ThemeSwitch } from "@sovir/ui-web/theme";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const consoleOrigin = "http://127.0.0.1:3001";
import { siteNav, type SiteEntry } from "../lib/content";

function menuOwns(entry: SiteEntry, current: string) {
  return entry.kind === "menu" && entry.columns.some((column) => column.items.some((item) => item.href === current));
}

export function Masthead({ current }: { current: string }) {
  const headerRef = useRef<HTMLElement>(null);
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
        setSheet(false);
      }
    }
    function onPointer(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMenu(null);
        setSheet(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  function close() {
    setMenu(null);
    setSheet(false);
  }

  function hoverable() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  return (
    <header ref={headerRef} className={sheet ? "masthead is-open" : "masthead"}>
      <div className="masthead-bar">
        <Link className="brand-lockup" href="/" onClick={close}>
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">SOVIR</span>
        </Link>
        <nav id="secciones" className={sheet ? "site-index is-open" : "site-index"} aria-label="Secciones">
          {siteNav.map((entry) =>
            entry.kind === "menu" ? (
              <div
                key={entry.id}
                className={["site-menu", menu === entry.id ? "is-open" : "", menuOwns(entry, current) ? "is-current" : ""]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => {
                  if (hoverable()) setMenu(entry.id);
                }}
                onMouseLeave={() => {
                  if (hoverable()) setMenu((value) => (value === entry.id ? null : value));
                }}
              >
                <button
                  className="site-trigger"
                  type="button"
                  aria-expanded={sheet || menu === entry.id}
                  aria-controls={`panel-${entry.id}`}
                  onClick={(event) => {
                    const openedByHover = event.detail !== 0 && hoverable();
                    setMenu((value) => {
                      if (openedByHover && value === entry.id) return value;
                      return value === entry.id ? null : entry.id;
                    });
                  }}
                >
                  {entry.label}
                  <span className="chevron" aria-hidden="true" />
                </button>
                <div className="site-panel" id={`panel-${entry.id}`} role="group" aria-label={entry.label}>
                  {entry.columns.map((column) => (
                    <div key={column.heading}>
                      <p className="kicker">{column.heading}</p>
                      <ul>
                        {column.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={item.href === current ? "page" : undefined}
                              onClick={close}
                            >
                              <span>{item.label}</span>
                              <small>{item.note}</small>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={entry.href}
                className="site-trigger"
                href={entry.href}
                aria-current={entry.href === current ? "page" : undefined}
                onClick={close}
              >
                {entry.label}
              </Link>
            ),
          )}
        </nav>
        <div className="masthead-tools">
          <div className="masthead-session">
            <ThemeSwitch />
            <a className="masthead-enter" href={`${consoleOrigin}/sign-in`} onClick={close}>
              Entrar
            </a>
            <a className="button masthead-register" href={`${consoleOrigin}/registro`} onClick={close}>
              Registro
            </a>
          </div>
          <button
            className="menu-toggle"
            type="button"
            aria-expanded={sheet}
            aria-controls="secciones"
            onClick={() => {
              setMenu(null);
              setSheet((value) => !value);
            }}
          >
            {sheet ? "Cerrar" : "Menú"}
          </button>
        </div>
      </div>
    </header>
  );
}
