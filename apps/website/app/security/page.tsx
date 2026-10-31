import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Seguridad" };

export default function SecurityPage() {
  return (
    <SiteFrame current="/security">
      <Article page={pages.security} />
    </SiteFrame>
  );
}
