import type { Metadata } from "next";
import Link from "next/link";
import { SiteFrame } from "../../components/SiteFrame";

export const metadata: Metadata = {
  title: "Términos del servicio",
};

export default function TermsPage() {
  return (
    <SiteFrame current="/terminos">
      <article>
        <h1>Términos del servicio</h1>
        <p className="lede">
          Al continuar con el registro aceptas estos términos y la política de privacidad. Este texto se irá
          completando a medida que el servicio habilite cada parte.
        </p>
        <section>
          <h2>La cuenta</h2>
          <p>
            Google, GitHub, Microsoft, Apple y el correo son las puertas de entrada. La cuenta se conserva cuando esa
            función esté habilitada. Hoy el registro no guarda la cuenta ni llama a esos servicios.
          </p>
        </section>
        <section>
          <h2>Uso del sitio</h2>
          <p>
            El sitio público explica el producto y su manejo. No pide capturas ni conversaciones. La consola de trabajo
            vive en otro origen.
          </p>
        </section>
        <section>
          <h2>Privacidad</h2>
          <p>
            El tratamiento de datos está en la <Link href="/privacy">Política de privacidad</Link>.
          </p>
        </section>
      </article>
    </SiteFrame>
  );
}
