import { resolve } from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactCompiler: true,
  turbopack: {
    root: resolve(__dirname, ".."),
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  allowedDevOrigins: ["10.0.0.104"],
};

export default nextConfig;
