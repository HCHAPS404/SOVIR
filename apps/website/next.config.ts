import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
