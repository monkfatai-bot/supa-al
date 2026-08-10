import type { Metadata } from "next";
import { ThemeProvider, QueryProvider } from "@/providers";
import { Toaster } from "@/components/ui/sonner";
import { ensureAutomationInitialized } from "@/lib/automation-init";
import "./globals.css";

// Load Google Fonts with graceful fallback for isolated build environments
let geistSans = { variable: "" };
let geistMono = { variable: "" };

try {
  const { Geist, Geist_Mono } = await import("next/font/google");
  geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
  });
  geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
  });
} catch {
  // Fonts couldn't load (network unavailable in build environment)
  // Fall back to system fonts defined in globals.css
}

export const metadata: Metadata = {
  title: {
    default: "Supa AI",
    template: "%s | Supa AI",
  },
  description:
    "AI-powered platform built on Supabase. Fast, scalable, and secure.",
  keywords: ["Supa AI", "AI", "Supabase", "Next.js", "TypeScript"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize automation registries (fire-and-forget, non-blocking)
  void ensureAutomationInitialized().catch(() => {});

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
