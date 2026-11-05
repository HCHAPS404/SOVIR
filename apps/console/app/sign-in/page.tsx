import { getLocale, stringsFor, type Strings } from "../../lib/i18n";
import { oidcConfig } from "../../lib/oidc";

export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

const ERROR_KEYS: Record<string, keyof Strings["signin"]["errors"]> = {
  backend: "backend",
  session: "session",
  name: "name",
  oidc_denied: "oidcDenied",
  oidc_state: "oidcState",
  oidc_exchange: "oidcExchange",
  oidc_token: "oidcToken",
};

function DevSessionForm({ s }: { s: Strings }) {
  return (
    <form className="register-email" action="/bff/session" method="post">
      <label>
        {s.signin.inputLabel}
        <input
          name="principal"
          type="text"
          required
          minLength={1}
          maxLength={40}
          pattern="[A-Za-z0-9._\-\s]+"
          placeholder={s.signin.placeholder}
          autoComplete="username"
        />
      </label>
      <button className="button secondary" type="submit">
        {s.signin.button}
      </button>
    </form>
  );
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dev?: string }>;
}) {
  const { error, dev } = await searchParams;
  const s = stringsFor(await getLocale());
  const key = error ? ERROR_KEYS[error] : undefined;
  const note = key ? s.signin.errors[key] : null;
  const oidc = oidcConfig();
  return (
    <main className="register-stage">
      <div className="register-card">
        <p className="brand-lockup">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">SOVIR</span>
        </p>
        <h1>{s.signin.title}</h1>
        {note ? <p role="alert">{note}</p> : null}
        <p>{s.signin.sub}</p>
        {oidc ? (
          <>
            <form className="register-email" action="/bff/auth/oidc/login" method="get">
              <button className="button" type="submit">
                {s.signin.oidcButton}
              </button>
            </form>
            <form className="register-email" action="/bff/auth/oidc/register" method="get">
              <button className="button secondary" type="submit">
                {s.signin.registerButton}
              </button>
            </form>
            {dev ? (
              <details className="dev-mode">
                <summary>{s.signin.devMode}</summary>
                <DevSessionForm s={s} />
                <p className="register-note">{s.signin.note}</p>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <DevSessionForm s={s} />
            <p className="register-note">{s.signin.note}</p>
          </>
        )}
      </div>
    </main>
  );
}
