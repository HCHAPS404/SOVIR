import { ThemeSwitch } from "@sovir/ui-web/theme";

export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <main className="content">
      <ThemeSwitch />
      <p className="brand-lockup">
        <span className="mark" aria-hidden="true" />
        <span className="brand-name">SOVIR</span>
      </p>
      <h1>Sesión de demostración</h1>
      <p className="lede">
        Crea una cookie HttpOnly local llamada de demostración. No es una cuenta, no hay contraseña y no hay datos reales.
      </p>
      <form action="/api/session" method="post">
        <input type="hidden" name="intent" value="sign-in" />
        <button type="submit">Entrar con fixture sintético</button>
      </form>
      <p>
        <a href="/registro">Registro simulado</a>
      </p>
    </main>
  );
}
