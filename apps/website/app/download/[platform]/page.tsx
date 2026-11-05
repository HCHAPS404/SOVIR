import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "../../../components/SiteFrame";
import { PlatformIcon } from "../../../components/PlatformIcon";
import { AutoDownload } from "../../../components/AutoDownload";
import { downloads, findDownload } from "../../../lib/downloads";

export function generateStaticParams() {
  return downloads.map((item) => ({ platform: item.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const item = findDownload(platform);
  return { title: item ? `Descarga ${item.label}` : "Descarga" };
}

const GUIDES: Record<string, { steps: string[]; extra?: React.ReactNode }> = {
  android: {
    steps: [
      "Descarga el APK en tu teléfono.",
      "Ábrelo: Android te pedirá permitir la instalación desde esta fuente una vez.",
      "Abre SOVIR, crea tu cuenta o entra con la tuya, y concede la observación cuando lo pida.",
    ],
  },
  extension: {
    steps: [
      "Descarga y descomprime el ZIP en una carpeta que vayas a conservar.",
      "Abre chrome://extensions (o edge://extensions) y activa el modo desarrollador.",
      "Pulsa «Cargar descomprimida» y elige la carpeta. SOVIR aparece junto a la barra de direcciones.",
    ],
    extra: (
      <p className="note">
        La instalación automática en un clic exige publicar en la tienda del navegador — todavía no
        está enviada. Mientras tanto, estos tres pasos la dejan funcionando con los mismos permisos.
      </p>
    ),
  },
};

export default async function PlatformDownloadPage({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const item = findDownload(platform);
  if (!item) notFound();
  const guide = GUIDES[item.id];

  return (
    <SiteFrame current="/download">
      <article className="download-platform">
        <p className="kicker">Descarga</p>
        <div className="download-mark">
          <PlatformIcon id={item.id} />
        </div>
        <h1>{item.label}</h1>
        {item.file ? (
          <>
            <AutoDownload file={item.file} />
            <p className="lede">{item.note}. La descarga ya está en marcha — si no comenzó, usa el botón.</p>
            <p>
              <a className="button" href={item.file} download>
                Descargar{item.size ? ` (${item.size})` : ""}
              </a>
            </p>
            {guide ? (
              <section>
                <h2>Instalación</h2>
                <ol className="download-steps">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {guide.extra}
              </section>
            ) : null}
          </>
        ) : (
          <p className="lede">Próximamente — cuando exista el instalador, aquí estarán el archivo, el requisito y el hash.</p>
        )}
        <p>
          <Link href="/download">Todas las descargas</Link>
        </p>
      </article>
    </SiteFrame>
  );
}
