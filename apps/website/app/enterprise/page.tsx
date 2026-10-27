import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Organizaciones" };

export default function EnterprisePage() {
  return (
    <SiteFrame current="/enterprise">
      <Article page={pages.enterprise} />
    </SiteFrame>
  );
}
