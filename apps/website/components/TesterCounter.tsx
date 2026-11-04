"use client";

import { useEffect, useRef, useState } from "react";

// Real counters from GET /v1/public/stats — the number is whatever the
// installation actually holds (synthetic dev principals excluded server-
// side). Renders nothing when the API is unreachable: no fallback number,
// because a marketing counter must never invent one.

type Counters = { accounts: number; devices_active: number; events_seen: number };

export function TesterCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Counters | null>(null);
  const [shown, setShown] = useState<Counters>({ accounts: 0, devices_active: 0, events_seen: 0 });

  useEffect(() => {
    let dead = false;
    fetch("/api/v1/public/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: Counters) => {
        if (!dead) setData(c);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root || !data) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const apply = (t: number) =>
      setShown({
        accounts: Math.round(data.accounts * t),
        devices_active: Math.round(data.devices_active * t),
        events_seen: Math.round(data.events_seen * t),
      });
    if (reduce) {
      apply(1);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const t0 = performance.now();
        const dur = 1400;
        const ease = (x: number) => 1 - Math.pow(1 - x, 3);
        const frame = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          apply(ease(p));
          if (p < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      },
      { threshold: 0.4 },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [data]);

  if (!data) return null;

  const items = [
    { n: shown.accounts, label: "personas con cuenta" },
    { n: shown.devices_active, label: "dispositivos enlazados" },
    { n: shown.events_seen, label: "señales analizadas" },
  ];

  return (
    <div className="counter-band" ref={ref}>
      {items.map((it) => (
        <div className="counter" key={it.label}>
          <span className="counter-n">{it.n.toLocaleString("es-MX")}</span>
          <span className="counter-label">{it.label}</span>
        </div>
      ))}
      <p className="counter-note">Cifras reales de esta instalación, en directo.</p>
    </div>
  );
}
