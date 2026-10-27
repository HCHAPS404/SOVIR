import { LocalPath } from "../../components/LocalPath";
import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Cómo funciona" };

export default function HowPage() {
  return (
    <SiteFrame current="/how-it-works">
      <Article page={pages.how} />
      <LocalPath />
    </SiteFrame>
  );
}
