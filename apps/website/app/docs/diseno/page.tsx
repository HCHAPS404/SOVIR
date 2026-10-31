import { DocsGuide } from "../../../components/DocsGuide";

export const metadata = { title: "Cómo se lee la interfaz" };

export default function DocsDesignPage() {
  return (
    <DocsGuide
      current="/docs/diseno"
      title="Cómo se lee la interfaz"
      lede="Para reconocer el claro, el oscuro y la acción principal. No es el manual interno de marca ni el archivo de diseño."
    >
      <section>
        <h2>Dos fondos</h2>
        <p>
          Claro es papel. Oscuro es el instrumento. El mismo contenido está en los dos. El icono de sol o luna, en la
          barra, es el mando: al pulsarlo cambian el dibujo y el fondo.
        </p>
      </section>
      <section>
        <h2>Qué está marcado</h2>
        <p>
          El símbolo y el nombre identifican el sitio. La página actual lleva un filete bronce bajo su enlace. El
          bronce no significa alerta. Aviso, peligro y lo desconocido usan otros colores, aparte de la marca.
        </p>
      </section>
      <section>
        <h2>Acciones</h2>
        <p>
          El botón relleno es la acción de esa vista, por ejemplo Cómo funciona en el inicio o Registro en la barra.
          Un enlace sin botón es una salida secundaria, como Descarga. En el menú estrecho, las secciones se listan
          bajo Menú.
        </p>
      </section>
      <section>
        <h2>Qué no busca esta guía</h2>
        <p>
          No entrega archivos de marca, medidas internas ni instrucciones para construir el sistema. Si la interfaz
          cambia, esta pestaña describe el manejo visible, no un compromiso de que cada detalle ya esté congelado.
        </p>
      </section>
    </DocsGuide>
  );
}
