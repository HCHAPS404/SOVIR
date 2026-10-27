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
    lede: "SOVIR es un nombre de trabajo para un sistema local de autonomía digital. Esta página describe la intención. No afirma una protección ya probada.",
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
