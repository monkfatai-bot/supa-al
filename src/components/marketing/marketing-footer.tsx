"use client";

/**
 * Supa AI — Marketing footer.
 *
 * 4-column footer (Product / Resources / Company / Legal) plus a newsletter
 * signup form and the social links (GitHub / X / Discord).
 *
 * The newsletter form POSTs to `/api/marketing/newsletter` and surfaces
 * success + error feedback via the Sonner toaster. Loading state disables
 * the submit button while the request is in flight.
 *
 * @module @/components/marketing/marketing-footer
 */
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Github, Twitter, MessageCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/logo";
import { APP_NAME } from "@/lib/constants/app";
import type { ApiResponse } from "@/types/api";
import type { MarketingViewId } from "./marketing-data";

export interface MarketingFooterProps {
  onNavigate: (id: MarketingViewId) => void;
}

interface FooterColumn {
  title: string;
  links: ReadonlyArray<{ label: string; view: MarketingViewId; href: string }>;
}

const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Overview", view: "products", href: "/?view=products" },
      { label: "AI Employees", view: "ai-employees", href: "/?view=ai-employees" },
      { label: "Workflow Builder", view: "workflows", href: "/?view=workflows" },
      { label: "Marketplace", view: "marketplace", href: "/?view=marketplace" },
      { label: "Integrations", view: "integrations", href: "/?view=integrations" },
      { label: "Pricing", view: "pricing", href: "/?view=pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", view: "blog", href: "/?view=blog" },
      { label: "Documentation", view: "docs", href: "/?view=docs" },
      { label: "Changelog", view: "changelog", href: "/?view=changelog" },
      { label: "API reference", view: "docs", href: "/?view=docs" },
      { label: "Status", view: "about", href: "/?view=about" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", view: "about", href: "/?view=about" },
      { label: "Contact", view: "contact", href: "/?view=contact" },
      { label: "Careers", view: "about", href: "/?view=about" },
      { label: "Press", view: "about", href: "/?view=about" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", view: "about", href: "/?view=about" },
      { label: "Terms", view: "about", href: "/?view=about" },
      { label: "Security", view: "about", href: "/?view=about" },
      { label: "GDPR", view: "about", href: "/?view=about" },
    ],
  },
];

const SOCIAL_LINKS = [
  { label: "GitHub", href: "https://github.com/supa-ai", icon: Github },
  { label: "X (Twitter)", href: "https://x.com/supaai", icon: Twitter },
  { label: "Discord", href: "https://discord.gg/supaai", icon: MessageCircle },
] as const;

export function MarketingFooter({ onNavigate }: MarketingFooterProps) {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const onSubscribe = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "footer" }),
      });
      const json = (await res.json()) as ApiResponse<{ email: string; status: string }>;
      if (!res.ok || !json.success) {
        const message = json.success === false ? json.error.message : "Subscription failed.";
        toast.error(message);
        return;
      }
      toast.success("You're subscribed! Check your inbox to confirm.");
      setEmail("");
    } catch (err) {
      toast.error("Network error. Please try again.");
      void err;
    } finally {
      setLoading(false);
    }
  }, [email, loading]);

  return (
    <footer className="mt-auto border-t border-border/60 bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-6">
          {/* Brand + newsletter */}
          <div className="lg:col-span-2">
            <Logo size={32} withWordmark />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              The enterprise AI platform that runs your business. Chat, images,
              voice, video, AI Employees, workflows, and a marketplace — all
              in one workspace.
            </p>
            <form className="mt-4 flex flex-col gap-2" onSubmit={onSubscribe}>
              <Label htmlFor="footer-newsletter-email" className="text-xs text-muted-foreground">
                Subscribe to the newsletter
              </Label>
              <div className="flex gap-2">
                <Input
                  id="footer-newsletter-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="max-w-xs"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Send className="mr-1 size-3.5" />
                  {loading ? "Subscribing…" : "Subscribe"}
                </Button>
              </div>
            </form>
          </div>

          {/* 4 link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      onClick={() => onNavigate(link.view)}
                      className="text-sm text-muted-foreground transition-colors hover:text-emerald-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-emerald-600"
                >
                  <Icon className="size-4" />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
