import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Funnel serves the marketing site under /web — assets and routes must
  // carry the prefix or /_next/* hits the console app instead.
  basePath: "/web",
  transpilePackages: ["@sovir/ui-web"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
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
