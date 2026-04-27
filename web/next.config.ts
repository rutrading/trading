import { resolve } from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, ".."),
  devIndicators: false,
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.logo.dev",
      },
    ],
  },
  turbopack: {
    root: resolve(__dirname, ".."),
  },
  experimental: {
    preloadEntriesOnStart: false,
    optimizePackageImports: ["@tanstack/react-virtual"],
  },
  allowedDevOrigins: ["10.0.0.104"],
};

export default nextConfig;
