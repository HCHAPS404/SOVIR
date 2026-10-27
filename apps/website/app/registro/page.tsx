import type { Metadata } from "next";
import Link from "next/link";
import { SiteFrame } from "../../components/SiteFrame";

export const metadata: Metadata = {
  title: "Registro",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ simulado?: string }>;
}) {
  const query = await searchParams;
  return (
    <SiteFrame current="/registro">
      <article>
        <h1>Registro simulado</h1>
        <p className="lede">
          Este formulario no crea una cuenta, no guarda la clave y no llama a un servidor.
        </p>
        <form className="fields" action="/registro" method="get">
          <label>
            Nombre
            <input name="nombre" autoComplete="off" />
          </label>
          <label>
            Correo
            <input name="correo" type="email" autoComplete="off" />
          </label>
          <label>
            Clave
            <input name="clave" type="password" autoComplete="off" />
          </label>
          <input type="hidden" name="simulado" value="1" />
          <button type="submit">Simular registro</button>
        </form>
        {query.simulado ? <p>No se guardó el registro. No hay cuenta.</p> : null}
        <p>
          <Link href="/sign-in">Volver a entrar</Link>
        </p>
      </article>
    </SiteFrame>
  );
}
