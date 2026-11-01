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
  prevProtectedCount: number;
  prevSignalCount: number;
  categories: { label: string; count: number }[];
  lastAlertAt: number | null;
  lastActivityAt: number | null;
  status: "quiet" | "protected" | "empty";
}

export function weeklyDigest(data: PrincipalDataExport, now = Date.now()): WeeklyDigest {
  const since = now - WEEK_MS;
  const prevSince = since - WEEK_MS;
  const weekEvents = data.events.filter((e) => e.observed_at_ms >= since);
  const weekAlerts = data.interventions.filter((i) => i.created_at_ms >= since);
  const prevEvents = data.events.filter(
    (e) => e.observed_at_ms >= prevSince && e.observed_at_ms < since,
  );
  const prevAlerts = data.interventions.filter(
    (i) => i.created_at_ms >= prevSince && i.created_at_ms < since,
  );

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
  const allTimes = data.events
    .map((e) => e.observed_at_ms)
    .concat(data.interventions.map((i) => i.created_at_ms));
  const lastActivityAt = allTimes.length ? Math.max(...allTimes) : null;

  return {
    protectedCount: weekAlerts.length,
    signalCount: weekEvents.length,
    prevProtectedCount: prevAlerts.length,
    prevSignalCount: prevEvents.length,
    categories,
    lastAlertAt,
    lastActivityAt,
    status: weekAlerts.length > 0 ? "protected" : weekEvents.length > 0 ? "quiet" : "empty",
  };
}

// Week-over-week delta chip — honest labels, no fake percentages.
export function trendDelta(cur: number, prev: number): { label: string; tone: string } | null {
  if (cur === prev) return cur === 0 ? null : { label: "igual que la semana pasada", tone: "flat" };
  if (prev === 0) return { label: "nueva actividad", tone: "new" };
  const diff = cur - prev;
  return {
    label: `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs semana pasada`,
    tone: diff > 0 ? "up" : "down",
  };
}

// Merged recent activity — interventions + observed signals, newest first.
// Human-language titles via the same vocabulary the incident page uses.
export interface FeedItem {
  at: number;
  kind: "alert" | "signal";
  title: string;
  note: string;
}

export function recentActivity(data: PrincipalDataExport, limit = 6): FeedItem[] {
  const items: FeedItem[] = [];
  for (const i of data.interventions) {
    const prefix = i.event_id.split("-")[0];
    items.push({
      at: i.created_at_ms,
      kind: "alert",
      title: "Alerta de protección",
      note:
        prefix === "pay"
          ? "pago solicitado tras presión de urgencia"
          : prefix === "uit"
            ? "diseño engañoso detectado por el observador"
            : "señal de riesgo interceptada",
    });
  }
  for (const e of data.events) {
    const names = e.signals
      .map((s) => SIGNAL_LABELS[s])
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");
    items.push({
      at: e.observed_at_ms,
      kind: "signal",
      title: "Señal observada",
      note: names || "actividad registrada sin señales de riesgo",
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}

// Daily counts for the last `days` days, oldest first — feeds the hero
// sparkline. Real timestamps only; empty days count as zero.
export function dailyBuckets(timestamps: number[], days = 7, now = Date.now()): number[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = new Array(days).fill(0);
  const start = Math.floor(now / dayMs) - (days - 1);
  for (const ts of timestamps) {
    const idx = Math.floor(ts / dayMs) - start;
    if (idx >= 0 && idx < days) buckets[idx] += 1;
  }
  return buckets;
}

const SHORT_DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

export interface LabeledDayBucket {
  label: string;
  count: number;
  heightPct: number;
  isPeak: boolean;
}

export function dailyLabeledBuckets(
  timestamps: number[],
  days = 7,
  now = Date.now(),
): LabeledDayBucket[] {
  const counts = dailyBuckets(timestamps, days, now);
  const max = Math.max(...counts, 1);
  const peakIdx = counts.reduce((best, c, i) => (c >= counts[best] ? i : best), counts.length - 1);
  const dayMs = 24 * 60 * 60 * 1000;
  return counts.map((count, i) => {
    const dayDate = new Date(now - (days - 1 - i) * dayMs);
    const label = SHORT_DAYS[dayDate.getDay()] ?? `D${i + 1}`;
    const heightPct = count === 0 ? 12 : Math.max(18, Math.round((count / max) * 100));
    return {
      label,
      count,
      heightPct,
      isPeak: i === peakIdx && count > 0,
    };
  });
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
