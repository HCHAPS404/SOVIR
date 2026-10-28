"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function LandingScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const beats = [...root.querySelectorAll<HTMLElement>("[data-beat]")];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const markVisible = () => {
      const view = window.innerHeight;
      for (const beat of beats) {
        if (beat.classList.contains("is-in")) continue;
        const box = beat.getBoundingClientRect();
        if (box.top < view * 0.88 && box.bottom > view * 0.06) beat.classList.add("is-in");
      }
    };

    markVisible();
    root.dataset.ready = "true";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.22, rootMargin: "0px 0px -8% 0px" },
    );

    for (const beat of beats) {
      if (!beat.classList.contains("is-in")) observer.observe(beat);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="unfold" ref={ref}>
      {children}
    </div>
  );
}
