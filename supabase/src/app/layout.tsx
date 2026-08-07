import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider, QueryProvider } from "@/components/providers";
import { APP_NAME, APP_DESCRIPTION, APP_VERSION } from "@/lib/constants/app";
import { env } from "@/lib/config/env";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = env.app.url;
const ogImage = `${appUrl}/api/og`; // reserved for a future OG-image route
const twitterHandle = "@supaai";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${APP_NAME} — Enterprise AI Platform`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "AI platform",
    "ChatGPT alternative",
    "AI SaaS",
    "OpenAI",
    "Anthropic",
    "Google AI",
    "Supa AI",
    "AI Employees",
    "Workflow Builder",
    "AI Marketplace",
    "Business AI",
    "Integration Hub",
  ],
  authors: [{ name: APP_NAME, url: appUrl }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: "technology",
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/logo.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["en_GB", "fr_FR", "es_ES", "de_DE", "ja_JP", "zh_CN"],
    url: appUrl,
    siteName: APP_NAME,
    title: `${APP_NAME} — Enterprise AI Platform`,
    description: APP_DESCRIPTION,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: `${APP_NAME} — Enterprise AI Platform`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: twitterHandle,
    creator: twitterHandle,
    title: `${APP_NAME} — Enterprise AI Platform`,
    description: APP_DESCRIPTION,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Placeholders — replaced via env in a future Phase when the SEO team
    // provides the actual tokens. The keys are present so the meta tags
    // render and can be populated without redeploying schema.
    google: undefined,
    yandex: undefined,
    yahoo: undefined,
    other: {},
  },
  other: {
    "app-version": APP_VERSION,
    "app-environment": env.app.environment,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

/**
 * JSON-LD structured data describing Supa AI as a SoftwareApplication.
 * Renders inside `<script type="application/ld+json">` so Google can
 * surface rich results (ratings, pricing, category) in SERP.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: APP_NAME,
  description: APP_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: appUrl,
  version: APP_VERSION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free tier with generous monthly limits.",
  },
  publisher: {
    "@type": "Organization",
    name: APP_NAME,
    url: appUrl,
    logo: {
      "@type": "ImageObject",
      url: `${appUrl}/logo.svg`,
    },
  },
  potentialAction: [
    {
      "@type": "RegisterAction",
      target: `${appUrl}/?signup=1`,
      name: "Sign up",
    },
    {
      "@type": "SignInAction",
      target: `${appUrl}/?signin=1`,
      name: "Sign in",
    },
  ],
  sameAs: [
    "https://github.com/supa-ai",
    "https://x.com/supaai",
    "https://discord.gg/supaai",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          // JSON-LD is a static, server-supplied blob. `dangerouslySetInnerHTML`
          // is the standard pattern — the content is a frozen literal, never
          // user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <QueryProvider>
            <div className="min-h-screen flex flex-col bg-background">
              {children}
            </div>
            <SonnerToaster position="bottom-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
