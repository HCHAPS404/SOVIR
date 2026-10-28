import { DocsGuide } from "../../../components/DocsGuide";

export const metadata = { title: "Cómo leer una indicación" };

export default function DocsResearchPage() {
  return (
    <DocsGuide
      current="/docs/investigacion"
      title="Cómo leer lo que dice el sitio"
      lede="Sirve para no tomar una frase de la página por un resultado medido. No publica un estudio ni un modelo."
    >
      <section>
        <h2>Tres lecturas</h2>
        <p>
          Hecho es lo observado, con su origen. Hipótesis es lo inferido y no es una medición. Desconocido es lo que
          no se pudo comprobar. Si una frase no dice cuál de las tres es, no la trates como una detección.
        </p>
      </section>
      <section>
        <h2>Casos de prueba</h2>
        <p>
          Las evaluaciones previstas usan casos sintéticos y separan si algo se clasificó bien de lo que costó
          hacerlo. En esta web no hay un conjunto publicado ni una cifra de precisión.
        </p>
      </section>
      <section>
        <h2>La fecha no es un resultado</h2>
        <p>
          El texto de investigación del sitio está fechado el 27 de octubre de 2026. Esa fecha marca la redacción.
          No es el día en que un sistema detectó algo.
        </p>
      </section>
      <section>
        <h2>Qué hacer con una advertencia futura</h2>
        <p>
          Pide de dónde salió y qué quedó sin comprobar. Si solo ofrece una etiqueta de riesgo, todavía no es una
          indicación usable. La consola de trabajo, cuando exista de verdad, es el lugar de esa lectura. Este sitio
          no muestra incidentes.
        </p>
      </section>
    </DocsGuide>
  );
}
