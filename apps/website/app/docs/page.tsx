import Link from "next/link";
import { DocsGuide } from "../../components/DocsGuide";
import { landingPortal } from "../../lib/content";

export const metadata = { title: "Guía de uso" };

export default function DocsPage() {
  return (
    <DocsGuide
      current="/docs"
      title="Cómo usar este sitio"
      lede="Esta guía explica el manejo de la página pública. No describe el interior del proyecto ni sustituye una política firmada."
    >
      <section>
        <h2>Moverse</h2>
        <p>
          La barra tiene cuatro entradas. Producto y Documentación abren un panel. Organizaciones y Precios van
          directo. En una ventana estrecha, Menú reúne los mismos grupos.
        </p>
      </section>
      <section>
        <h2>Dónde está cada punto</h2>
        <p>Estos son los apartados del sitio. También están listados en la portada.</p>
        <ul className="docs-index">
          {landingPortal.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Claro y oscuro</h2>
        <p>
          El icono de la barra es el sol en claro y la luna en oscuro. Al pulsarlo cambian el icono y la página.
          La elección se recuerda en este navegador. Otro dispositivo, u otro origen, guarda la suya.
        </p>
      </section>
      <section>
        <h2>Entrar y registro</h2>
        <p>
          Los formularios simulan el recorrido. Enviarlos no crea una cuenta ni guarda un mensaje. La consola de
          trabajo vive en otro origen y no se abre desde el índice de este sitio.
        </p>
      </section>
      <section>
        <h2>Lo que todavía no está</h2>
        <p>
          No hay instaladores, precios ni sensores publicados. Descarga lo dice en su página. Las tres etapas del
          inicio describen el recorrido previsto: dispositivo, política y remoto. No certifican una protección.
        </p>
      </section>
    </DocsGuide>
  );
}
