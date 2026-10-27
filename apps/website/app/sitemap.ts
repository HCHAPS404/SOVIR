import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/product",
    "/how-it-works",
    "/platforms",
    "/security",
    "/privacy",
    "/trust",
    "/enterprise",
    "/pricing",
    "/research",
    "/download",
  ];
  return paths.map((path) => ({
    url: `http://127.0.0.1:3000${path || "/"}`,
    changeFrequency: "monthly",
  }));
}
