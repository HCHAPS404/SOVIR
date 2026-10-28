import { ConsoleAccess } from "../../components/ConsoleAccess";

export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <main className="register-stage">
      <div className="access-stack">
        <ConsoleAccess mode="entrar" />
        <form className="dev-profile" action="/api/session" method="post">
          <input type="hidden" name="intent" value="developer" />
          <button type="submit">Perfil de desarrollador</button>
        </form>
      </div>
    </main>
  );
}
