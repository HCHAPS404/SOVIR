export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  backend: "El servicio local de SOVIR no está encendido en 127.0.0.1:8787.",
  session: "Tu sesión terminó — vuelve a escribir tu nombre para entrar.",
  name: "Usa solo letras, números, punto o guion (sin espacios especiales).",
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
        <h1>Tu protección personal</h1>
        {note ? <p role="alert">{note}</p> : null}
        <p>
          SOVIR te ayuda a detectar estafas, cobros engañosos y mensajes de presión antes de que
          tomes una decisión apresurada. Todo funciona en tu propio equipo.
        </p>
        <form className="register-email" action="/api/session" method="post">
          <label>
            Escribe tu nombre para abrir tu espacio
            <input
              name="principal"
              type="text"
              required
              minLength={1}
              maxLength={40}
              pattern="[A-Za-z0-9._\-\s]+"
              placeholder="p. ej. Ana"
              autoComplete="username"
            />
          </label>
          <button className="button" type="submit">
            Entrar a mi panel
          </button>
        </form>
        <p className="register-note">
          Cada nombre tiene su propio espacio privado de avisos, dispositivos y permisos. Entorno
          local de demostración (sesión aislada en <code>httpOnly</code>, sin contraseñas ni envío
          de datos a terceros).
        </p>
      </div>
    </main>
  );
}
