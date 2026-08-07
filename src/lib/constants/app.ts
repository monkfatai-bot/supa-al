/**
 * Supa AI — application-level constants.
 *
 * Branding strings, locale defaults, primary navigation, and social links.
 * Anything that appears in the UI chrome (header, footer, marketing pages)
 * should live here so a single edit propagates everywhere.
 *
 * @module @/lib/constants/app
 */

/** Public product name. Mirrors `NEXT_PUBLIC_APP_NAME` in `.env.example`. */
export const APP_NAME = "Supa AI" as const;

/** Short product description used in `<meta>` and hero sections. */
export const APP_DESCRIPTION =
  "Production-grade AI SaaS — chat, image generation, marketplace, and business tools in one workspace." as const;

/** Semver-style app version. Bumped per release. */
export const APP_VERSION = "0.1.0" as const;

/** Default UI locale (BCP-47 language tag). */
export const DEFAULT_LOCALE = "en" as const;

/** Locales the platform is localized into. */
export const SUPPORTED_LOCALES = [
  "en",
  "fr",
  "es",
  "de",
  "pt",
  "ja",
  "zh",
  "ar",
] as const;

/** Union of supported locale codes. */
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Navigation entry used by header / sidebar / footer menus. */
export interface NavItem {
  /** Display label. */
  label: string;
  /** Relative or absolute href. */
  href: string;
  /** Optional Lucide icon name (resolved by the renderer). */
  icon?: string;
  /** Optional subtitle / tooltip text. */
  description?: string;
  /** `true` when the link points to an external domain. */
  external?: boolean;
}

/**
 * Primary navigation. Render order matters — UI iterates this array as-is.
 */
export const APP_NAVIGATION: readonly NavItem[] = [
  {
    label: "Chat",
    href: "/chat",
    icon: "message-square",
    description: "Conversational AI assistant",
  },
  {
    label: "Image Generation",
    href: "/image",
    icon: "image",
    description: "Generate images from text prompts",
  },
  {
    label: "Marketplace",
    href: "/marketplace",
    icon: "store",
    description: "Browse and publish AI tools",
  },
  {
    label: "Business Tools",
    href: "/tools",
    icon: "briefcase",
    description: "Workflows for teams and businesses",
  },
  {
    label: "Pricing",
    href: "/pricing",
    icon: "credit-card",
    description: "Plans and billing",
  },
  {
    label: "Docs",
    href: "/docs",
    icon: "book-open",
    description: "Developer documentation",
  },
] as const;

/** Social/community link entry. */
export interface SocialLink {
  label: string;
  href: string;
  /** Lucide icon name (e.g. `github`, `twitter`, `discord`). */
  icon: string;
}

/** Outbound social links rendered in the footer. */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    label: "GitHub",
    href: "https://github.com/supa-ai",
    icon: "github",
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/supaai",
    icon: "twitter",
  },
  {
    label: "Discord",
    href: "https://discord.gg/supaai",
    icon: "message-circle",
  },
] as const;
