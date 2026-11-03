import { redirect } from "next/navigation";

export const metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

import { consoleOrigin } from "../../lib/content";

export default function SignInPage() {
  redirect(`${consoleOrigin}/sign-in`);
}
