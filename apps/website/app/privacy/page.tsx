import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Privacidad" };

export default function PrivacyPage() {
  return (
    <SiteFrame current="/privacy">
      <Article page={pages.privacy} />
    </SiteFrame>
  );
}
