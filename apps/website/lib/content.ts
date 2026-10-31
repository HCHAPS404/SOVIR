export type PageCopy = {
  href: string;
  label: string;
  title: string;
  lede: string;
  sections: { heading: string; paragraphs: string[] }[];
};

export const pages: Record<string, PageCopy> = {
  home: {
    href: "/",
    label: "Inicio",
    title: "Ver lo que influye. Elegir lo que importa.",
    lede: "Señales en el dispositivo, una política que autoriza o se abstiene, y la decisión sigue en tus manos.",
    sections: [
      {
        heading: "Qué está construido",
        paragraphs: [
          "Hay un núcleo local de demostración y esta interfaz provisional. No hay sensores de pantalla publicados, ni modelos remotos conectados, ni certificación en tiendas.",
        ],
      },
    ],
  },
  product: {
    href: "/product",
    label: "Producto",
    title: "Qué puede observar, y qué no",
    lede: "La observación prevista exige permiso del sistema y un permiso revocable dentro de la aplicación.",
    sections: [
      {
        heading: "No hace",
        paragraphs: [
          "No lee otras aplicaciones por debajo del sistema, no evade pantallas seguras y no diagnostica estados de ánimo. Una instrucción escrita en la pantalla no gobierna la política interna.",
        ],
      },
    ],
  },
  how: {
    href: "/how-it-works",
    label: "Cómo funciona",
    title: "Primero en el dispositivo",
    lede: "El recorrido previsto filtra en local. La investigación remota es excepcional, con presupuesto y contexto minimizado.",
    sections: [
      {
        heading: "Límite actual",
        paragraphs: [
          "Ese recorrido no está certificado. El costo remoto de esta demostración es cero porque no llama a proveedores.",
        ],
      },
    ],
  },
  security: {
    href: "/security",
    label: "Seguridad",
    title: "El agente también es una superficie de ataque",
    lede: "El contenido observado se trata como dato no confiable. Una página puede intentar dar instrucciones al sistema.",
    sections: [
      {
        heading: "Controles previstos",
        paragraphs: [
          "Permiso visible, pausa, revocación y registros sin el texto de la pantalla. Esos controles no están certificados en esta versión.",
        ],
      },
    ],
  },
  privacy: {
    href: "/privacy",
    label: "Privacidad",
    title: "Cuatro permisos distintos",
    lede: "Capturar, enviar a la nube, conservar y compartir indicadores son decisiones separadas. Esta web no pide ninguna.",
    sections: [
      {
        heading: "Esta demostración",
        paragraphs: [
          "No guarda capturas ni conversaciones. No hay política legal firmada: hace falta revisión jurídica antes de un producto público.",
        ],
      },
    ],
  },
  trust: {
    href: "/trust",
    label: "Confianza",
    title: "Hecho, hipótesis y desconocido",
    lede: "Una advertencia tiene que decir de dónde sale y qué no se pudo comprobar.",
    sections: [
      {
        heading: "Separación",
        paragraphs: [
          "La consola autenticada vive en otro sitio. Este sitio no muestra incidentes ni datos de protección.",
        ],
      },
    ],
  },
  enterprise: {
    href: "/enterprise",
    label: "Organizaciones",
    title: "Agregados, no vigilancia de personas",
    lede: "Una organización prevista vería indicadores con umbral de privacidad. No vería chats privados ni un perfil emocional.",
    sections: [
      {
        heading: "Estado",
        paragraphs: ["No hay contrato empresarial, inquilinos ni facturación. Esta página no es una oferta."],
      },
    ],
  },
  research: {
    href: "/research",
    label: "Investigación",
    title: "Método antes que cifras",
    lede: "Las evaluaciones previstas usan casos sintéticos y separan precisión de costo. Aquí no hay un estudio publicado.",
    sections: [
      {
        heading: "Fecha de este texto",
        paragraphs: ["27 de octubre de 2026. No es un resultado de detección."],
      },
    ],
  },
};

export const nav = [
  pages.product,
  pages.how,
  { href: "/platforms", label: "Plataformas", title: "Plataformas", lede: "", sections: [] },
  pages.security,
  pages.privacy,
  pages.trust,
  pages.enterprise,
  { href: "/pricing", label: "Precios", title: "Precios", lede: "", sections: [] },
  pages.research,
  { href: "/download", label: "Descarga", title: "Descarga", lede: "", sections: [] },
];

export type SiteLink = { href: string; label: string; note: string };

export type SiteEntry =
  | { kind: "menu"; id: string; label: string; columns: { heading: string; items: SiteLink[] }[] }
  | { kind: "link"; href: string; label: string };

export const siteNav: SiteEntry[] = [
  {
    kind: "menu",
    id: "producto",
    label: "Producto",
    columns: [
      {
        heading: "Sistema",
        items: [
          { href: "/product", label: "Producto", note: "Qué puede observar, y qué no" },
          { href: "/how-it-works", label: "Cómo funciona", note: "Primero en el dispositivo" },
        ],
      },
      {
        heading: "Cobertura",
        items: [
          { href: "/platforms", label: "Plataformas", note: "Cobertura por sistema" },
          { href: "/download", label: "Descarga", note: "No hay binarios publicados" },
        ],
      },
    ],
  },
  {
    kind: "menu",
    id: "documentacion",
    label: "Documentación",
    columns: [
      {
        heading: "Guía de uso",
        items: [
          { href: "/docs", label: "Guía", note: "Cómo moverse por este sitio" },
          { href: "/docs/privacidad", label: "Privacidad de uso", note: "Qué recuerda este navegador" },
          { href: "/docs/investigacion", label: "Cómo leer", note: "Hecho, hipótesis y desconocido" },
          { href: "/docs/diseno", label: "Interfaz", note: "Claro, oscuro y la acción principal" },
        ],
      },
      {
        heading: "Criterio",
        items: [
          { href: "/security", label: "Seguridad", note: "El agente también es una superficie de ataque" },
          { href: "/privacy", label: "Privacidad", note: "Cuatro permisos distintos" },
          { href: "/trust", label: "Confianza", note: "Hecho, hipótesis y desconocido" },
          { href: "/research", label: "Investigación", note: "Método antes que cifras" },
        ],
      },
    ],
  },
  { kind: "link", href: "/enterprise", label: "Organizaciones" },
  { kind: "link", href: "/pricing", label: "Precios" },
];

export const landingStages = [
  {
    index: "01",
    title: "Dispositivo",
    body: "El filtro previsto ocurre en el aparato. Observar exige permiso del sistema y otro permiso, revocable, dentro de la aplicación.",
    href: "/product",
    label: "Producto",
  },
  {
    index: "02",
    title: "Política",
    body: "Autoriza, se abstiene o pide una decisión. Una instrucción escrita en la pantalla no gobierna la política interna.",
    href: "/how-it-works",
    label: "Cómo funciona",
  },
  {
    index: "03",
    title: "Remoto",
    body: "Salir del dispositivo es excepcional, con presupuesto y contexto minimizado. Esta demostración no llama a proveedores: el costo remoto es cero.",
    href: "/security",
    label: "Seguridad",
  },
];

export const landingPortal = [
  { href: "/product", label: "Producto", note: "Qué puede observar, y qué no" },
  { href: "/how-it-works", label: "Cómo funciona", note: "Primero en el dispositivo" },
  { href: "/platforms", label: "Plataformas", note: "Cobertura por sistema" },
  { href: "/download", label: "Descarga", note: "No hay binarios publicados" },
  { href: "/security", label: "Seguridad", note: "El agente también es una superficie de ataque" },
  { href: "/privacy", label: "Privacidad", note: "Cuatro permisos distintos" },
  { href: "/trust", label: "Confianza", note: "Hecho, hipótesis y desconocido" },
  { href: "/research", label: "Investigación", note: "Método antes que cifras" },
  { href: "/enterprise", label: "Organizaciones", note: "Agregados, no vigilancia de personas" },
  { href: "/pricing", label: "Precios", note: "No hay precios publicados" },
];

export const landingReadings = [
  {
    title: "Hecho",
    body: "Lo observado, dicho con su origen.",
    href: "/trust",
  },
  {
    title: "Hipótesis",
    body: "Lo inferido. No es una medición.",
    href: "/trust",
  },
  {
    title: "Desconocido",
    body: "Lo que no se pudo comprobar.",
    href: "/trust",
  },
];

export const footerColumns: { heading: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    heading: "Sistema",
    links: [
      { href: "/product", label: "Producto" },
      { href: "/how-it-works", label: "Cómo funciona" },
      { href: "/platforms", label: "Plataformas" },
      { href: "/download", label: "Descarga" },
    ],
  },
  {
    heading: "Límites",
    links: [
      { href: "/security", label: "Seguridad" },
      { href: "/privacy", label: "Privacidad" },
    ],
  },
  {
    heading: "Criterio",
    links: [
      { href: "/trust", label: "Confianza" },
      { href: "/research", label: "Investigación" },
    ],
  },
  {
    heading: "Uso",
    links: [
      { href: "/enterprise", label: "Organizaciones" },
      { href: "/pricing", label: "Precios" },
      { href: "http://127.0.0.1:3001/sign-in", label: "Entrar", external: true },
      { href: "http://127.0.0.1:3001/registro", label: "Registro", external: true },
    ],
  },
  {
    heading: "Documentación",
    links: [
      { href: "/docs", label: "Guía" },
      { href: "/docs/privacidad", label: "Privacidad" },
      { href: "/docs/investigacion", label: "Investigación" },
      { href: "/docs/diseno", label: "Diseño" },
    ],
  },
  {
    heading: "Redes",
    links: [
      { href: "https://www.instagram.com/sovir", label: "Instagram", external: true },
      { href: "https://www.facebook.com/sovir", label: "Facebook", external: true },
      { href: "https://www.tiktok.com/@sovir", label: "TikTok", external: true },
      { href: "https://x.com/sovir", label: "X", external: true },
      { href: "https://www.youtube.com/@sovir", label: "YouTube", external: true },
      { href: "https://github.com/HCHAPS404/SOVIR", label: "GitHub", external: true },
    ],
  },
];
