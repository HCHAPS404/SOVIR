import type { Metadata } from "next";
import { RegisterPanel } from "../../components/RegisterPanel";
import { SiteFrame } from "../../components/SiteFrame";

export const metadata: Metadata = {
  title: "Registro",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <SiteFrame current="/registro">
      <RegisterPanel />
    </SiteFrame>
  );
}
