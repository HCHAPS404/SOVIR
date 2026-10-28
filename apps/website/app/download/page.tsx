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
        <p className="lede">Cada sistema tiene su página. Ningún instalador está publicado todavía.</p>
        <ul className="download-index">
          {downloads.map((item) => (
            <li key={item.id}>
              <Link href={`/download/${item.id}`}>
                <PlatformIcon id={item.id} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </SiteFrame>
  );
}
