"use client";

import { useState } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "../lib/locales";

// Manual UI-language override. Detection still defaults to the browser/OS
// locale (Accept-Language); this persists an explicit choice in a cookie.
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const [busy, setBusy] = useState(false);

  async function pick(next: Locale) {
    if (next === current || busy) return;
    setBusy(true);
    try {
      await fetch("/bff/lang", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="lang-switcher">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={current}
        disabled={busy}
        onChange={(e) => pick(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
