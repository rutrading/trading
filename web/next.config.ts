import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
