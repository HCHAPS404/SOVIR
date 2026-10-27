import { ThemeSwitch } from "@sovir/ui-web/theme";

export const metadata = { title: "Registro", robots: { index: false, follow: false } };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ simulado?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="content">
      <ThemeSwitch />
      <p className="brand-lockup">
        <span className="mark" aria-hidden="true" />
        <span className="brand-name">SOVIR</span>
      </p>
      <h1>Registro simulado</h1>
      <p className="lede">No se crea una cuenta y la clave no se guarda.</p>
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
        <a href="/sign-in">Volver a entrar</a>
      </p>
    </main>
  );
}
