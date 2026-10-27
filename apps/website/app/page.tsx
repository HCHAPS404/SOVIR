import { Article, SiteFrame } from "../components/SiteFrame";
import { pages } from "../lib/content";

export default function HomePage() {
  return (
    <SiteFrame current="/">
      <span className="mark hero-mark mark-enter" aria-hidden="true" />
      <Article page={pages.home} />
    </SiteFrame>
  );
}
