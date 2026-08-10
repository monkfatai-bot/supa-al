import type { NextConfig } from "next";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // Vercel manages the Next.js deployment output itself. Standalone is kept
  // for Docker/local production where the bundled server is required.
  ...(isVercel ? {} : { output: "standalone" as const }),
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
