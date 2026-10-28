import Link from "next/link";
import { HeroField } from "../components/HeroField";
import { LandingScroll } from "../components/LandingScroll";
import { SiteFrame } from "../components/SiteFrame";
import { landingReadings, landingStages, pages } from "../lib/content";

const systems = ["Android", "iOS", "Windows", "macOS", "Linux", "Navegador"];

const siteNotes = [
  { href: "/docs", label: "Guía", note: "Cómo moverse por este sitio" },
  { href: "/docs/privacidad", label: "Privacidad de uso", note: "Qué recuerda este navegador" },
  { href: "/docs/diseno", label: "Interfaz", note: "Claro, oscuro y la acción principal" },
  { href: "/platforms", label: "Plataformas", note: "Cobertura por sistema" },
  { href: "/enterprise", label: "Organizaciones", note: "Agregados, no vigilancia de personas" },
  { href: "/pricing", label: "Precios", note: "No hay precios publicados" },
];

export default function HomePage() {
  const page = pages.home;
  const breakAt = page.title.indexOf(". ");
  const lead = breakAt === -1 ? page.title : page.title.slice(0, breakAt + 1);
  const rest = breakAt === -1 ? "" : page.title.slice(breakAt + 2);

  return (
    <SiteFrame current="/" landing>
      <section className="showcase">
        <div className="showcase-copy">
          <h1>
            {lead}
            {rest ? <br /> : null}
            {rest}
          </h1>
          <p className="lede">{page.lede}</p>
          <div className="landing-actions">
            <Link className="button" href="/how-it-works">
              Cómo funciona
            </Link>
            <Link className="button secondary" href="/docs">
              Guía de uso
            </Link>
          </div>
        </div>
        <HeroField />
        <div className="field">
          <p className="kicker">Cobertura prevista</p>
          <ul>
            {systems.map((system) => (
              <li key={system}>{system}</li>
            ))}
          </ul>
        </div>
      </section>

      <LandingScroll>
        <section className="sheet beat" data-beat aria-labelledby="recorrido">
          <header className="block-head line">
            <h2 id="recorrido">El recorrido</h2>
            <p>Primero en el aparato. La política decide. Salir del dispositivo es excepcional.</p>
          </header>
          <div className="bento line">
            <article className="card bento-lead">
              <h3>{landingStages[0].title}</h3>
              <p>{landingStages[0].body}</p>
              <div className="well well-mark">
                <span className="mark" aria-hidden="true" />
                <span>En el dispositivo</span>
              </div>
              <Link href={landingStages[0].href}>{landingStages[0].label}</Link>
            </article>
            {landingStages.slice(1).map((stage) => (
              <article className="card" key={stage.title}>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
                <Link href={stage.href}>{stage.label}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="sheet beat" data-beat aria-labelledby="limites">
          <header className="block-head line">
            <h2 id="limites">Cuatro límites</h2>
            <p>Capturar, enviar, conservar y compartir no son la misma decisión.</p>
          </header>
          <div className="quad line">
            <article className="card">
              <h3>Privacidad</h3>
              <p>Esta web no pide ninguna de estas decisiones.</p>
              <ul className="well">
                <li>Capturar</li>
                <li>Enviar a la nube</li>
                <li>Conservar</li>
                <li>Compartir indicadores</li>
              </ul>
              <Link href="/privacy">Ver privacidad</Link>
            </article>
            <article className="card">
              <h3>Seguridad</h3>
              <p>El contenido observado se trata como dato no confiable.</p>
              <ul className="well">
                <li>Permiso visible</li>
                <li>Pausa</li>
                <li>Revocación</li>
                <li>Registro sin el texto de la pantalla</li>
              </ul>
              <Link href="/security">Ver seguridad</Link>
            </article>
            <article className="card">
              <h3>Confianza</h3>
              <p>Una advertencia tiene que decir de dónde sale.</p>
              <ul className="well">
                {landingReadings.map((reading) => (
                  <li key={reading.title}>{reading.title}</li>
                ))}
              </ul>
              <Link href="/trust">Ver confianza</Link>
            </article>
            <article className="card">
              <h3>Investigación</h3>
              <p>Las evaluaciones previstas usan casos sintéticos. Aquí no hay un estudio publicado.</p>
              <div className="well">
                <p>Método antes que cifras.</p>
              </div>
              <Link href="/research">Ver investigación</Link>
            </article>
          </div>
        </section>

        <section className="sheet beat" data-beat aria-labelledby="cobertura">
          <header className="block-head line">
            <h2 id="cobertura">Cobertura prevista</h2>
            <p>Seis sistemas. Ningún binario publicado.</p>
          </header>
          <ul className="systems line">
            {systems.map((system) => (
              <li key={system}>{system}</li>
            ))}
          </ul>
          <div className="studio line">
            <div className="studio-mark">
              <span className="mark" aria-hidden="true" />
            </div>
            <div>
              <h3>{page.sections[0].heading}</h3>
              {page.sections[0].paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <Link className="button" href="/how-it-works">
                Cómo funciona
              </Link>
            </div>
          </div>
        </section>

        <section className="sheet beat" data-beat aria-labelledby="lectura">
          <header className="block-head line">
            <h2 id="lectura">Cómo se distingue</h2>
            <p>Hecho, hipótesis y desconocido no se mezclan.</p>
          </header>
          <div className="trio line">
            {landingReadings.map((reading) => (
              <Link className="card" href={reading.href} key={reading.title}>
                <h3>{reading.title}</h3>
                <p>{reading.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="sheet beat" data-beat aria-labelledby="sitio">
          <header className="block-head line">
            <h2 id="sitio">En el sitio</h2>
            <p>Guía de uso y las páginas que dicen qué no está ofrecido.</p>
          </header>
          <div className="notes line">
            {siteNotes.map((item) => (
              <Link key={item.href} href={item.href}>
                <span>{item.label}</span>
                <small>{item.note}</small>
              </Link>
            ))}
          </div>
        </section>

        <section className="sheet close-band beat" data-beat>
          <h2 className="line">Ver lo que influye. Elegir lo que importa.</h2>
          <div className="landing-actions line">
            <Link className="button" href="/how-it-works">
              Cómo funciona
            </Link>
            <Link className="button secondary" href="/download">
              Descarga
            </Link>
          </div>
        </section>
      </LandingScroll>
    </SiteFrame>
  );
}
