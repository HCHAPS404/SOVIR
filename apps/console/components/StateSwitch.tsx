import Link from "next/link";
import { stateByPath, states } from "../lib/nav";

const labels: Record<(typeof states)[number], string> = {
  ready: "Listo",
  loading: "Carga",
  empty: "Vacío",
  offline: "Sin conexión",
  error: "Error",
  "permission-denied": "Sin permiso",
  limited: "Cobertura limitada",
  revoked: "Revocado",
  review: "Revisión",
};

export function StateSwitch({
  path,
  state,
  fallback,
}: {
  path: string;
  state: string;
  fallback: (typeof states)[number];
}) {
  const options = stateByPath[path];
  if (!options) return null;
  return (
    <nav className="state-nav" aria-label="Estado de presentación">
      {options.map((item) => (
        <Link
          key={item}
          href={item === fallback ? path : `${path}?state=${item}`}
          aria-current={item === state ? "true" : undefined}
        >
          {labels[item]}
        </Link>
      ))}
    </nav>
  );
}
