import { SiteFrame } from "../../components/SiteFrame";

export const metadata = { title: "Próximamente" };

export default function PricingPage() {
  return (
    <SiteFrame current="/pricing">
      <article>
        <p className="kicker">Precios</p>
        <h1>Próximamente</h1>
        <p className="lede">
          Todavía no hay planes ni plataforma de pagos. SOVIR está en pruebas con las personas que ya
          crearon su cuenta — cuando haya algo que cobrar, esta página dirá qué y por qué.
        </p>
      </article>
    </SiteFrame>
  );
}
