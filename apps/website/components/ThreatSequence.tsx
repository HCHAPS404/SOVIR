"use client";

import { useEffect, useState } from "react";
import { AndroidWarning, PhoneFrame, type SequenceStep } from "./AppScreens";

const STEPS: { step: SequenceStep; ms: number; caption: string }[] = [
  { step: 0, ms: 2600, caption: "Llega un mensaje" },
  { step: 1, ms: 1400, caption: "SOVIR lo observa en el teléfono" },
  { step: 2, ms: 2000, caption: "Extrae señales — no el texto" },
  { step: 3, ms: 2200, caption: "El consejo vota" },
  { step: 4, ms: 4600, caption: "Te avisa y te dice por qué" },
];

export function ThreatSequence() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setIdx(STEPS.length - 1);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = (i: number) => {
      timer = setTimeout(() => {
        const next = (i + 1) % STEPS.length;
        setIdx(next);
        tick(next);
      }, STEPS[i].ms);
    };
    tick(0);
    return () => clearTimeout(timer);
  }, []);

  const { step, caption } = STEPS[idx];

  return (
    <div className="threat-seq">
      <PhoneFrame>
        <AndroidWarning step={step} />
      </PhoneFrame>
      <ol className="seq-captions" aria-label="Secuencia de aviso">
        {STEPS.map((s, i) => (
          <li key={s.caption} className={i === idx ? "on" : i < idx ? "done" : ""}>
            <span className="seq-num">{i + 1}</span>
            {s.caption}
          </li>
        ))}
      </ol>
      <span className="sr-only">{caption}</span>
    </div>
  );
}
