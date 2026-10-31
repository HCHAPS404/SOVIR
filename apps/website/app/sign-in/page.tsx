import { redirect } from "next/navigation";

export const metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  redirect("http://127.0.0.1:3001/sign-in");
}
