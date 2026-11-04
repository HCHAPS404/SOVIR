import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Funnel serves the marketing site under /web — assets and routes must
  // carry the prefix or /_next/* hits the console app instead.
  basePath: "/web",
  transpilePackages: ["@sovir/ui-web"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    // Same-origin /api for the public counter. On the funnel, Tailscale
    // serves /api before this app sees it; in dev, proxy to the local API.
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8787/:path*",
        basePath: false,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/download/ios", destination: "/download/apple", permanent: false },
      { source: "/download/macos", destination: "/download/apple", permanent: false },
      { source: "/download/android", destination: "/download", permanent: false },
      { source: "/download/linux", destination: "/download", permanent: false },
    ];
  },
};

export default nextConfig;
