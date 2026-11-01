// Server-rendered inline sparkline — plain SVG, no client JS.
const W = 148;
const H = 44;

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? W / (values.length - 1) : W;
  const pts = values.map((v, i) => [
    Math.round(i * step * 10) / 10,
    Math.round((H - 4 - (v / max) * (H - 10)) * 10) / 10,
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]?.[0] ?? W},${H - 2} L0,${H - 2} Z`;
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label="Actividad de los últimos 7 días"
    >
      <path className="area" d={area} />
      <path className="line" d={line} />
    </svg>
  );
}
