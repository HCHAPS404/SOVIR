import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/product",
    "/how-it-works",
    "/platforms",
    "/security",
    "/privacy",
    "/terminos",
    "/trust",
    "/enterprise",
    "/pricing",
    "/research",
    "/download",
    "/download/apple",
    "/download/windows",
    "/docs",
    "/docs/privacidad",
    "/docs/investigacion",
    "/docs/diseno",
  ];
  return paths.map((path) => ({
    url: `http://127.0.0.1:3000${path || "/"}`,
    changeFrequency: "monthly",
  }));
}
