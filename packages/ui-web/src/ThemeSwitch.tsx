"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  const stored = document.documentElement.dataset.theme;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function choose(next: Theme) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("sovir-theme", next);
    setTheme(next);
  }

  return (
    <div className="theme-switch" role="group" aria-label="Tema">
      <button type="button" aria-pressed={theme === "light"} onClick={() => choose("light")}>
        Claro
      </button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => choose("dark")}>
        Oscuro
      </button>
    </div>
  );
}
