import { SiteFrame } from "../../components/SiteFrame";

export const metadata = { title: "Precios" };

export default function PricingPage() {
  return (
    <SiteFrame current="/pricing">
      <article>
        <h1>No hay precios publicados</h1>
        <p className="lede">
          Personal, Plus y Enterprise siguen como hipótesis. Esta página no muestra cifras, planes ni botones de pago.
        </p>
      </article>
    </SiteFrame>
  );
}
