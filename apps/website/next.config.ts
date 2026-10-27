import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sovir/ui-web"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
