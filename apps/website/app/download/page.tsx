import { SiteFrame } from "../../components/SiteFrame";

export const metadata = { title: "Descarga" };

export default function DownloadPage() {
  return (
    <SiteFrame current="/download">
      <article>
        <h1>No hay binarios publicados</h1>
        <p className="lede">
          Cuando existan instaladores firmados, esta página mostrará sistema, requisito y hash. Hoy no hay descarga.
        </p>
      </article>
    </SiteFrame>
  );
}
