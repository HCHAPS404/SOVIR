import { redirect } from "next/navigation";

export const metadata = {
  title: "Registro",
  robots: { index: false, follow: false },
};

import { consoleOrigin } from "../../lib/content";

export default function RegisterPage() {
  redirect(`${consoleOrigin}/registro`);
}
