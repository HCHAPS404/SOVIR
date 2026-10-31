import { DocsGuide } from "../../../components/DocsGuide";

export const metadata = { title: "Privacidad de uso" };

export default function DocsPrivacyPage() {
  return (
    <DocsGuide
      current="/docs/privacidad"
      title="Qué hacer con tus datos aquí"
      lede="Indicaciones para quien usa esta web. No es el expediente interno del proyecto ni un contrato jurídico."
    >
      <section>
        <h2>En este navegador</h2>
        <p>
          Se recuerda el tema claro u oscuro. Entrar y registro no conservan lo que escribes. Esta página no pide
          captura de pantalla, envío a la nube, conservación ni compartir indicadores.
        </p>
      </section>
      <section>
        <h2>Cuatro decisiones distintas</h2>
        <p>
          En el producto previsto, capturar, enviar fuera del dispositivo, conservar y compartir un indicador son
          permisos separados. Conceder uno no concede los otros. Esta demostración no activa ninguno.
        </p>
      </section>
      <section>
        <h2>Qué no se guarda</h2>
        <p>
          No se guardan capturas ni conversaciones. No hay una política legal firmada: hace falta revisión jurídica
          antes de un producto público. Esta pestaña no reemplaza ese texto.
        </p>
      </section>
      <section>
        <h2>Si más adelante hay un permiso</h2>
        <p>
          Tiene que verse, poder pausarse y poder revocarse. Un texto escrito en otra aplicación no debería ordenar
          esa revocación ni saltársela. Ese control aún no está publicado en un sensor real.
        </p>
      </section>
    </DocsGuide>
  );
}
