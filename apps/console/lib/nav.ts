export const operation = [
  { href: "/", label: "Inicio" },
  { href: "/protections", label: "Protecciones" },
  { href: "/incidents", label: "Incidentes" },
  { href: "/investigations", label: "Investigaciones" },
  { href: "/devices", label: "Dispositivos" },
  { href: "/permissions", label: "Permisos" },
  { href: "/resources", label: "Recursos" },
] as const;

export const account = [
  { href: "/account", label: "Cuenta" },
  { href: "/settings", label: "Ajustes" },
] as const;

export const enterprise = [
  { href: "/enterprise/policies", label: "Políticas" },
  { href: "/enterprise/aggregates", label: "Agregados" },
  { href: "/enterprise/integrations", label: "Integraciones" },
  { href: "/enterprise/audit", label: "Auditoría" },
  { href: "/enterprise/billing", label: "Facturación" },
] as const;

export const states = [
  "ready",
  "loading",
  "empty",
  "offline",
  "error",
  "permission-denied",
  "limited",
  "revoked",
  "review",
] as const;

export type PresentationState = (typeof states)[number];

export const stateByPath: Partial<Record<string, readonly PresentationState[]>> = {
  "/": ["empty", "permission-denied", "offline", "error", "revoked"],
  "/protections": ["ready", "permission-denied", "revoked"],
  "/incidents": ["ready", "empty", "review", "error"],
  "/investigations": ["ready", "empty", "error"],
  "/devices": ["empty", "limited", "permission-denied"],
  "/permissions": ["ready", "permission-denied", "revoked"],
  "/resources": ["ready", "empty"],
};
