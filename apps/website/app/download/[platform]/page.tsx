import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "../../../components/SiteFrame";
import { PlatformIcon } from "../../../components/PlatformIcon";
import { downloads, findDownload } from "../../../lib/downloads";

export function generateStaticParams() {
  return downloads.map((item) => ({ platform: item.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const item = findDownload(platform);
  return { title: item ? `Descarga ${item.label}` : "Descarga" };
}

export default async function PlatformDownloadPage({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const item = findDownload(platform);
  if (!item) notFound();

  return (
    <SiteFrame current="/download">
      <article className="download-platform">
        <p className="kicker">Descarga</p>
        <div className="download-mark">
          <PlatformIcon id={item.id} />
        </div>
        <h1>{item.label}</h1>
        <p className="lede">
          El instalador de {item.label} todavía no está publicado. Esta es su página: cuando exista, aquí estarán el
          archivo, el requisito y el hash.
        </p>
        <p>
          <Link href="/download">Todas las descargas</Link>
        </p>
      </article>
    </SiteFrame>
  );
}
