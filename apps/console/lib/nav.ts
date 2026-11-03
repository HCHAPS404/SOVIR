export const operation = [
  { href: "/", label: "Inicio" },
  { href: "/incidents", label: "Incidentes" },
  { href: "/investigations", label: "Investigaciones" },
  { href: "/devices", label: "Dispositivos" },
  { href: "/permissions", label: "Permisos" },
] as const;

export const enterprise = [
  { href: "/enterprise/audit", label: "Auditoría" },
  { href: "/webhooks", label: "Webhooks" },
] as const;
