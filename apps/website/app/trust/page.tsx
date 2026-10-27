import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Confianza" };

export default function TrustPage() {
  return (
    <SiteFrame current="/trust">
      <Article page={pages.trust} />
    </SiteFrame>
  );
}
