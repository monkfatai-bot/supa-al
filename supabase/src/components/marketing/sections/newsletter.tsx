"use client";

/**
 * Supa AI — Newsletter signup section.
 *
 * Standalone section (separate from the footer's compact form) with a
 * larger email input, brand-marked submit button, success + error toasts,
 * and a small "we never spam" trust line.
 *
 * @module @/components/marketing/sections/newsletter
 */
import * as React from "react";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiResponse } from "@/types/api";

export function NewsletterSection() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const onSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || loading) return;
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/newsletter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, source: "newsletter-section" }),
        });
        const json = (await res.json()) as ApiResponse<{ email: string }>;
        if (!res.ok || !json.success) {
          const message =
            json.success === false ? json.error.message : "Subscription failed.";
          toast.error(message);
          return;
        }
        toast.success("You're subscribed! Check your inbox to confirm.");
        setEmail("");
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, loading],
  );

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="newsletter-headline"
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 px-6 py-12 text-white sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 80% at 80% 20%, oklch(0.99 0 0 / 0.4), transparent 70%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/15">
            <Mail className="size-6" />
          </span>
          <div>
            <h2
              id="newsletter-headline"
              className="text-2xl font-bold tracking-tight sm:text-3xl"
            >
              Get product updates in your inbox
            </h2>
            <p className="mt-2 max-w-md text-sm text-emerald-50">
              One email per week. New features, templates, integrations, and
              customer stories. Unsubscribe in one click.
            </p>
          </div>
          <form className="flex w-full max-w-md flex-col gap-2 sm:flex-row" onSubmit={onSubmit}>
            <Label htmlFor="newsletter-section-email" className="sr-only">
              Email address
            </Label>
            <Input
              id="newsletter-section-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="bg-white/95 text-foreground"
            />
            <Button
              type="submit"
              disabled={loading}
              className="bg-white text-emerald-700 hover:bg-emerald-50"
            >
              <Send className="mr-1.5 size-3.5" />
              {loading ? "Subscribing…" : "Subscribe"}
            </Button>
          </form>
          <p className="text-xs text-emerald-100/80">
            We never share your email. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  );
}
