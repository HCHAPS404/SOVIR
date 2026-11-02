// Human-language descriptions for console surfaces. Technical ids stay
// available as a muted detail line — meaning first, identifiers second.

// Typed inference hypotheses (sovir-adapters classifier labels + remote
// provider output which uses the same closed label set) → plain Spanish.
const HYPOTHESIS_LABELS: Record<string, string> = {
  authority_coercion: "suplantación de autoridad para presionar",
  bulk_buyer_lure: "comprador falso que mueve la venta fuera",
  credential_phishing: "robo de credenciales",
  credential_request_unverified: "piden credenciales sin identidad verificada",
  customs_fee_phish: "cargo aduanero falso",
  data_harvesting: "cosecha de datos personales",
  extortion_attempt: "intento de extorsión",
  gift_card_shakedown: "exigencia de pago con tarjetas regalo",
  guaranteed_investment: "inversión con ganancia garantizada",
  health_fraud_pitch: "cura milagrosa fraudulenta",
  identity_unverified: "identidad no verificada",
  job_fee_bait: "empleo que cobra cuota inicial",
  link_spoofing: "enlace que finge ser otro",
  manipulative_pattern: "patrón manipulativo",
  offplatform_lure: "intento de moverte fuera de la plataforma",
  payment_fraud_attempt: "intento de fraude de pago",
  payment_request_unverified: "piden pago sin identidad verificada",
  privacy_tracking_exposure: "exposición de rastreo",
  prize_advance_fee: "premio que exige pago por adelantado",
  qr_phishing_lure: "cebo de phishing por QR",
  romance_money_bait: "gancho romántico con pedido de dinero",
  scareware_lure: "susto técnico para que instales algo",
  seed_phrase_theft: "robo de frase de recuperación",
  urgency_pressure: "presión de urgencia",
};

export function describeHypothesis(label: string): string {
  return HYPOTHESIS_LABELS[label] ?? label;
}

export function describeSource(sourceId: string): { name: string; does: string } {
  switch (sourceId) {
    case "console-lab":
      return { name: "Laboratorio de la consola", does: "emite señales de prueba de riesgo" };
    case "screen-observer:sim":
      return { name: "Observador de pantalla (simulado)", does: "observa señales en tu pantalla" };
    case "browser.synthetic":
      return { name: "Navegador (simulado)", does: "emite señales de navegación de prueba" };
    default:
      return { name: `Fuente “${sourceId}”`, does: "envía señales de observación" };
  }
}

export function grantStatus(
  g: { revoked: boolean; expires_at_ms: number },
  now: number,
): string {
  if (g.revoked) return "Revocado — ya no puede enviar señales";
  if (g.expires_at_ms <= now) return "Expirado";
  return `Activo hasta ${new Date(g.expires_at_ms).toLocaleString("es")}`;
}

export function describeIntervention(i: {
  kind: string;
  state: string;
  event_id: string;
}): { title: string; what: string; state: string } {
  const title = i.kind === "warn_banner" ? "Alerta de protección" : `Acción ${i.kind}`;
  const prefix = i.event_id.split("-")[0];
  const what =
    prefix === "pay"
      ? "Un sitio te pidió un pago justo después de presionarte con urgencia — posible estafa."
      : prefix === "hook"
        ? "Un sitio te presionó con urgencia — primer paso típico de una estafa."
        : prefix === "uit"
          ? "El observador de pantalla detectó un patrón de diseño engañoso."
          : "SOVIR detectó una señal de riesgo en tu actividad.";
  const state =
    i.state === "pending"
      ? "pendiente de mostrarse"
      : i.state === "delivered"
        ? "mostrada"
        : i.state === "failed"
          ? "no pudo mostrarse"
          : i.state;
  return { title, what, state };
}

const PLATFORM_NAMES: Record<string, string> = {
  ANDROID: "Android",
  IOS: "iPhone / iPad",
  WINDOWS: "Windows",
  MACOS: "Mac",
  LINUX: "Linux",
  BROWSER_EXTENSION: "Extensión de navegador",
};

export function describePlatform(p: string): string {
  return PLATFORM_NAMES[p] ?? p;
}

const ACTION_TITLES: Record<string, string> = {
  session_issued: "Inicio de sesión",
  session_revoked: "Cierre de sesión",
  consent_granted: "Permiso concedido",
  consent_revoked: "Permiso revocado",
  event_ingested: "Señal observada",
  device_registered: "Dispositivo registrado",
  device_revoked: "Dispositivo revocado",
  intervention_dispatched: "Alerta enviada",
  data_exported: "Exportaste tus datos",
  data_purged: "Borraste tus datos",
};

const GRANT_NAMES: Record<string, string> = {
  "console-lab-grant": "Laboratorio de la consola",
  "sim-observer-grant": "Observador de pantalla (simulado)",
};

export function describeAudit(a: { action: string; detail: string }): {
  title: string;
  sub: string;
} {
  const title = ACTION_TITLES[a.action] ?? a.action.replaceAll("_", " ");
  const decision = /decision:(\w+)/.exec(a.detail)?.[1];
  const decisionLabel =
    decision === "Warn"
      ? "alerta emitida"
      : decision === "Observe"
        ? "registrada sin alerta"
        : (decision ?? "");
  const device = /dev:([^\s]+)/.exec(a.detail)?.[1];
  const deviceLabel = device === "console-web" ? "desde la consola web" : device ? `desde ${device}` : "";
  const grant = /grant:([^\s]+)/.exec(a.detail)?.[1];
  const grantLabel = grant ? (GRANT_NAMES[grant] ?? grant) : "";
  const sub = [grantLabel, decisionLabel, deviceLabel].filter(Boolean).join(" · ");
  return { title, sub };
}

// Timeline dot tone per audit action — semantic, matches the chip palette.
export function auditTone(action: string): "success" | "warning" | "danger" | "brand" | "unknown" {
  if (action === "consent_granted" || action === "device_registered") return "success";
  if (action === "intervention_dispatched") return "warning";
  if (action === "consent_revoked" || action === "device_revoked" || action === "data_purged")
    return "danger";
  if (action === "event_ingested") return "brand";
  return "unknown";
}
