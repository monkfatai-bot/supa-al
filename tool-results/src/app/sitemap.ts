import type { MetadataRoute } from "next";

import { env } from "@/lib/config/env";
import { APP_NAME } from "@/lib/constants/app";

/**
 * Supa AI — sitemap.xml generator (Next.js MetadataRoute).
 *
 * Enumerates the 12 public marketing pages so search engines can discover
 * every top-level surface. The marketing pages use query-param-based
 * navigation (e.g. `/?view=pricing`) rather than separate Next.js routes,
 * so each entry is a distinct URL on the same `/` route.
 *
 * @module @/app/sitemap
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.app.url;
  const now = new Date();

  // 12 static marketing pages. The blog / docs / changelog single-post
  // URLs are intentionally NOT included here — those should be appended
  // dynamically by a future enhancement that queries the marketing tables.
  const paths: readonly { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/",             priority: 1.0, changeFrequency: "weekly" },
    { path: "/?view=products",     priority: 0.9, changeFrequency: "monthly" },
    { path: "/?view=pricing",      priority: 0.9, changeFrequency: "monthly" },
    { path: "/?view=blog",         priority: 0.8, changeFrequency: "weekly" },
    { path: "/?view=docs",         priority: 0.8, changeFrequency: "weekly" },
    { path: "/?view=marketplace",  priority: 0.7, changeFrequency: "weekly" },
    { path: "/?view=ai-employees", priority: 0.7, changeFrequency: "monthly" },
    { path: "/?view=workflows",    priority: 0.7, changeFrequency: "monthly" },
    { path: "/?view=integrations", priority: 0.7, changeFrequency: "weekly" },
    { path: "/?view=contact",      priority: 0.6, changeFrequency: "yearly" },
    { path: "/?view=about",        priority: 0.5, changeFrequency: "yearly" },
    { path: "/?view=changelog",    priority: 0.7, changeFrequency: "weekly" },
  ];

  return paths.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path.startsWith("/") ? path : `/${path}`}`,
    lastModified: now,
    changeFrequency,
    priority,
    // Title is used by some search engines as a hint; APP_NAME keeps it
    // consistent with the metadata in `layout.tsx`.
    title: `${APP_NAME} — ${path.replace("/?view=", "").replace("/", "home")}`,
  }));
}
