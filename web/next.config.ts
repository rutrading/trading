import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactCompiler: true,
  turbopack: {
    root: "..",
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  allowedDevOrigins: ["10.0.0.104"],
};

export default nextConfig;
