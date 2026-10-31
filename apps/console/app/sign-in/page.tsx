export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  backend: "La API dev no responde en 127.0.0.1:8787 — arranca cargo run -p sovir-api.",
  session: "La sesión no es válida o expiró — entra de nuevo.",
};

const profiles = [
  { intent: "synthetic", label: "Sesión demo", note: "principal console-demo" },
  { intent: "developer", label: "Sesión desarrollador", note: "principal console-dev" },
] as const;

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
        <div className="register-options">
          {profiles.map((p) => (
            <form key={p.intent} className="dev-profile" action="/api/session" method="post">
              <input type="hidden" name="intent" value={p.intent} />
              <button className="register-option" type="submit">
                {p.label} · {p.note}
              </button>
            </form>
          ))}
        </div>
        <p className="register-note">
          Autenticación sintética de desarrollo — no hay registro ni proveedores externos en la API
          local.
        </p>
      </div>
    </main>
  );
}
