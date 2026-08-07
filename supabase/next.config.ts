import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // The sandbox preview panel serves the app from a different origin than
  // localhost:3000. Allow it to access HMR / dev assets without warnings.
  allowedDevOrigins: ["*.space-z.ai", "*.z.ai"],
};

export default nextConfig;
