import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: "..",
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
};

export default nextConfig;
