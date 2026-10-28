import { ConsoleAccess } from "../../components/ConsoleAccess";

export const metadata = { title: "Registro", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return (
    <main className="register-stage">
      <ConsoleAccess mode="registro" />
    </main>
  );
}
