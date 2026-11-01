export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  backend: "La API dev no responde en 127.0.0.1:8787 — arranca cargo run -p sovir-api.",
  session: "La sesión no es válida o expiró — entra de nuevo.",
  name: "Ese nombre no es válido — usa letras, números, punto, guion o guion bajo.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const note = error ? errors[error] : null;
  return (
    <main className="register-stage">
      <div className="register-card">
        <p className="brand-lockup">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">SOVIR</span>
        </p>
        <h1>Entrar</h1>
        {note ? <p role="alert">{note}</p> : null}
        <p>
          La consola local autentica contra la API dev (<code>POST /v1/auth/dev-session</code>). El
          token queda en una cookie <code>httpOnly</code>: el navegador nunca lo toca.
        </p>
        <form className="register-email" action="/api/session" method="post">
          <label>
            Nombre de usuario
            <input
              name="principal"
              type="text"
              required
              minLength={1}
              maxLength={40}
              pattern="[A-Za-z0-9._\-]+"
              placeholder="p. ej. ana"
              autoComplete="username"
            />
          </label>
          <button className="button" type="submit">
            Entrar
          </button>
        </form>
        <p className="register-note">
          Cada nombre es un principal aislado: sus consents, eventos y auditoría son propios y
          persisten entre sesiones. Autenticación sintética de desarrollo — no hay contraseñas ni
          proveedores externos en la API local.
        </p>
      </div>
    </main>
  );
}
