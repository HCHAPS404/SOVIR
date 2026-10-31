import type { ReactNode } from "react";

export type PatternState =
  | "loading"
  | "ready"
  | "empty"
  | "offline"
  | "error"
  | "permission-denied"
  | "limited"
  | "revoked"
  | "review";

const notes: Record<PatternState, string> = {
  loading: "Cargando un fixture sintético.",
  ready: "Dato de demostración, no una detección validada.",
  empty: "No hay observaciones. Eso no significa protección activa.",
  offline: "Sin conexión. La cobertura remota no está disponible.",
  error: "No se pudo mostrar el fixture.",
  "permission-denied": "Permiso no concedido. No hay captura.",
  limited: "Cobertura limitada. Falta una fuente. Limitado no es protegido.",
  revoked: "El permiso fue revocado. No hay cobertura activa.",
  review: "Revisión de un fixture sintético, no una detección validada.",
};

export function StateNote({ state }: { state: PatternState }) {
  return <p className="kicker">{notes[state]}</p>;
}

function Frame({
  title,
  state,
  children,
}: {
  title: string;
  state: PatternState;
  children?: ReactNode;
}) {
  return (
    <section className="pattern" aria-labelledby={title.replace(/\s+/g, "-")}>
      <p className="kicker">Sintético</p>
      <h3 id={title.replace(/\s+/g, "-")}>{title}</h3>
      <StateNote state={state} />
      {state === "ready" || state === "review" ? children : null}
    </section>
  );
}

export function RiskEvidenceCard({ state = "ready" }: { state?: PatternState }) {
  return (
    <Frame title="Evidencia" state={state}>
      <p className="fact">
        <span className="tag observed">Observado. </span>
        Una página de prueba pide un código de un solo uso y un cambio de cuenta.
      </p>
      <p className="fact">
        <span className="tag inferred">Inferido, no verificado. </span>
        Podría ser una suplantación. No hay fuente independiente en este fixture.
      </p>
      <p className="fact">
        <span className="tag unknown">Desconocido. </span>
        La identidad del remitente no está corroborada.
      </p>
    </Frame>
  );
}

export function ConsentScopePicker({ state = "ready" }: { state?: PatternState }) {
  return (
    <Frame title="Alcance del permiso" state={state}>
      <p className="fact">Captura de esta sesión, solo en fuentes que elijas. Se puede revocar.</p>
      <p className="fact">Este control no sustituye el diálogo del sistema operativo.</p>
    </Frame>
  );
}

export function InvestigationTimeline({ state = "ready" }: { state?: PatternState }) {
  return (
    <Frame title="Investigación" state={state}>
      <ol>
        <li>Evento sintético registrado.</li>
        <li>Hipótesis separada del hecho.</li>
        <li>Verificación externa: no ejecutada. Costo remoto: 0.</li>
      </ol>
    </Frame>
  );
}

export function ResourceUsagePanel({ state = "ready" }: { state?: PatternState }) {
  return (
    <Frame title="Recursos" state={state}>
      <p className="fact">Inferencias de pago en este fixture: 0. No hay medición de batería en este equipo.</p>
    </Frame>
  );
}

export function PlatformCoverage({ state = "ready" }: { state?: PatternState }) {
  return (
    <Frame title="Cobertura" state={state}>
      <p className="fact">Ningún sistema operativo tiene certificación funcional. La ausencia de eventos no es protección.</p>
    </Frame>
  );
}

export function PrivacyControl({ state = "ready" }: { state?: PatternState }) {
  return (
    <Frame title="Privacidad" state={state}>
      <p className="fact">Retención de este demo: solo en memoria del navegador. No se envían capturas.</p>
    </Frame>
  );
}
