import { redirect } from "next/navigation";

export const metadata = {
  title: "Registro",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  redirect("http://127.0.0.1:3001/registro");
}
