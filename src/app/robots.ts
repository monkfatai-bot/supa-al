import type { MetadataRoute } from "next";

import { env } from "@/lib/config/env";

/**
 * Supa AI — robots.txt generator (Next.js MetadataRoute).
 *
 * Replaces the static `public/robots.txt` so the rules stay in sync with
 * the live app URL across dev / staging / prod. Allows all well-behaved
 * crawlers (Googlebot, Bingbot, Twitterbot, facebookexternalhit, and the
 * generic `*`) on every path, and points them at the dynamic sitemap.
 *
 * @module @/app/robots
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.app.url;

  return {
    rules: [
      // Allow all crawlers full access. Phase 11 is a public marketing
      // surface — every route is intended to be indexed. If/when private
      // dashboard routes are added under the same origin, this will be
      // tightened to disallow them explicitly.
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
