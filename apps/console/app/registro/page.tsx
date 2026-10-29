import Link from "next/link";

export const metadata = { title: "Registro", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return (
    <main className="register-stage">
      <div className="register-card">
        <p className="brand-lockup">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">SOVIR</span>
        </p>
        <h1>Registro</h1>
        <p>
          La API dev local no tiene registro: mintea sesiones sintéticas directamente con{" "}
          <code>POST /v1/auth/dev-session</code>.
        </p>
        <Link className="text-link" href="/sign-in">
          Ir a entrar
        </Link>
      </div>
    </main>
  );
}
