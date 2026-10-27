export const personal = [
  { href: "/", label: "Overview" },
  { href: "/protections", label: "Protections" },
  { href: "/incidents", label: "Incidents" },
  { href: "/investigations", label: "Investigations" },
  { href: "/devices", label: "Devices" },
  { href: "/permissions", label: "Permissions" },
  { href: "/resources", label: "Resource Intelligence" },
  { href: "/account", label: "Account" },
  { href: "/settings", label: "Settings" },
];

export const enterprise = [
  { href: "/enterprise/policies", label: "Policies" },
  { href: "/enterprise/aggregates", label: "Aggregates" },
  { href: "/enterprise/integrations", label: "Integrations" },
  { href: "/enterprise/audit", label: "Audit" },
  { href: "/enterprise/billing", label: "Billing" },
];

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
