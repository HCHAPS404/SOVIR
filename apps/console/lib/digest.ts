import type { PrincipalDataExport } from "./api";

// Weekly user-facing digest computed from real exported data — never
// synthetic numbers. The window is the last 7 days of observed activity.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SIGNAL_LABELS: Record<string, string> = {
  PAYMENT_REQUEST: "Pagos solicitados bajo sospecha",
  CREDENTIAL_REQUEST: "Intentos de robo de contraseñas",
  URGENT_ACTION: "Tácticas de presión y urgencia",
  IDENTITY_UNVERIFIED: "Identidades sin verificar",
  CONSENT_DARK_PATTERN: "Diseños engañosos",
  TRACKING_OBSERVED: "Rastreo oculto",
  HIDDEN_FEE_PATTERN: "Cargos ocultos",
  USER_DEFINED_EXPOSURE_LIMIT: "Límites de exposición",
};

export interface WeeklyDigest {
  protectedCount: number;
  signalCount: number;
  categories: { label: string; count: number }[];
  lastAlertAt: number | null;
  status: "quiet" | "protected" | "empty";
}

export function weeklyDigest(data: PrincipalDataExport, now = Date.now()): WeeklyDigest {
  const since = now - WEEK_MS;
  const weekEvents = data.events.filter((e) => e.observed_at_ms >= since);
  const weekAlerts = data.interventions.filter((i) => i.created_at_ms >= since);

  const counts = new Map<string, number>();
  for (const e of weekEvents) {
    if (e.signals.length === 0) {
      counts.set("Otras señales", (counts.get("Otras señales") ?? 0) + 1);
    }
    for (const s of e.signals) {
      const label = SIGNAL_LABELS[s] ?? "Otras señales";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const categories = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const lastAlertAt = weekAlerts.length
    ? Math.max(...weekAlerts.map((i) => i.created_at_ms))
    : null;

  return {
    protectedCount: weekAlerts.length,
    signalCount: weekEvents.length,
    categories,
    lastAlertAt,
    status: weekAlerts.length > 0 ? "protected" : weekEvents.length > 0 ? "quiet" : "empty",
  };
}

export function timeAgo(ms: number, now = Date.now()): string {
  const mins = Math.round((now - ms) / 60_000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
