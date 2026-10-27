import { SiteFrame } from "../../components/SiteFrame";

export const metadata = { title: "Plataformas" };

const rows = [
  ["Android", "MediaProjection documentada", "NOT_IMPLEMENTED"],
  ["iOS", "ScreenCaptureKit documentada en versiones compatibles", "NOT_IMPLEMENTED"],
  ["Windows", "Windows.Graphics.Capture documentada", "Solo shell visual"],
  ["macOS", "ScreenCaptureKit documentada", "Solo shell visual"],
  ["Linux", "Portal ScreenCast, depende del compositor", "Solo shell visual"],
  ["Navegador", "Permisos de host opcionales", "Popup local, sin tienda"],
];

export default function PlatformsPage() {
  return (
    <SiteFrame current="/platforms">
      <article>
        <h1>Cobertura por sistema</h1>
        <p className="lede">
          Una API documentada no es una aplicación aceptada en la tienda ni una captura ya probada.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Referencia</th>
                <th>En este repositorio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([system, reference, status]) => (
                <tr key={system}>
                  <td>{system}</td>
                  <td>{reference}</td>
                  <td>{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </SiteFrame>
  );
}
