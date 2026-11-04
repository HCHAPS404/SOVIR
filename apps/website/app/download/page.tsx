import Link from "next/link";
import { SiteFrame } from "../../components/SiteFrame";
import { PlatformIcon } from "../../components/PlatformIcon";
import { downloads } from "../../lib/downloads";

export const metadata = { title: "Descarga" };

export default function DownloadPage() {
  return (
    <SiteFrame current="/download">
      <article>
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
      </article>
    </SiteFrame>
  );
}
