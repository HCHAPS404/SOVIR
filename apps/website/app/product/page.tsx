import { Article, SiteFrame } from "../../components/SiteFrame";
import { pages } from "../../lib/content";

export const metadata = { title: "Producto" };

export default function ProductPage() {
  return (
    <SiteFrame current="/product">
      <Article page={pages.product} />
    </SiteFrame>
  );
}
