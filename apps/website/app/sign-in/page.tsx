import type { Metadata } from "next";
import { SiteFrame } from "../../components/SiteFrame";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <SiteFrame current="/sign-in">
      <article>
        <h1>La consola es otro sitio</h1>
        <p className="lede">
          Este sitio no inicia sesión y no guarda una cookie de protección. La demostración autenticada corre en la consola local.
        </p>
        <p>
          <a className="button" href="http://127.0.0.1:3001/sign-in">
            Abrir la consola local
          </a>
        </p>
        <p>
          <a href="/registro">Ver el registro simulado</a>
        </p>
      </article>
    </SiteFrame>
  );
}
