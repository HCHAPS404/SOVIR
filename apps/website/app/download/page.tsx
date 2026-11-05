import Link from "next/link";
import { SiteFrame } from "../../components/SiteFrame";
import { PlatformIcon } from "../../components/PlatformIcon";
import { PhotoSpot } from "../../components/PhotoSpot";
import { downloads } from "../../lib/downloads";

export const metadata = { title: "Descarga" };

export default function DownloadPage() {
  return (
    <SiteFrame current="/download">
      <article className="download-layout">
        <div>
          <h1>Descargas</h1>
          <p className="lede">
            Android y la extensión de navegador ya se instalan desde aquí. Escritorio, próximamente.
          </p>
          <ul className="download-index">
            {downloads.map((item) => (
              <li key={item.id}>
                <Link href={`/download/${item.id}`}>
                  <PlatformIcon id={item.id} />
                  <span>
                    {item.label}
                    {item.file ? null : <em> · próximamente</em>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="note download-hint">
            Al entrar en una plataforma, la descarga empieza sola — y debajo tienes los pasos de
            instalación.
          </p>
        </div>
        <aside className="download-side">
          <PhotoSpot
            src="/web/photos/escritorio-portatil.jpg"
            shot="descargas-escritorio"
            caption="En el teléfono y en el navegador — la misma cuenta."
            alt="Escritorio con portátil mostrando la consola de SOVIR"
            ratio="4 / 3"
          />
          <div className="download-guides">
            <p className="download-guides-title">Guías paso a paso</p>
            <Link href="/download/android">Instalar el APK en el teléfono</Link>
            <Link href="/download/extension">Cargar la extensión en el navegador</Link>
          </div>
        </aside>
      </article>
    </SiteFrame>
  );
}
