import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Investigación" };

export default function ResearchPage() {
  return (
    <SiteFrame current="/research">
      <Article page={pages.research} />
    </SiteFrame>
  );
}
