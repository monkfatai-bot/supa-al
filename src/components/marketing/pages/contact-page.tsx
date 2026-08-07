"use client";

/**
 * Supa AI — Contact page.
 *
 * Public contact-form. POSTs to `/api/marketing/contact` with name, email,
 * subject, message, and category. Includes loading state + Sonner toast
 * feedback on success / error.
 *
 * @module @/components/marketing/pages/contact-page
 */
import * as React from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "../sections/page-header";
import type { ApiResponse } from "@/types/api";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "partnership", label: "Partnership" },
  { value: "press", label: "Press" },
  { value: "security", label: "Security" },
  { value: "other", label: "Other" },
] as const;

export function ContactPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [category, setCategory] = React.useState<string>("general");
  const [loading, setLoading] = React.useState(false);

  const onSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            subject: subject || undefined,
            message,
            category,
          }),
        });
        const json = (await res.json()) as ApiResponse<{ id: string }>;
        if (!res.ok || !json.success) {
          const msg = json.success === false ? json.error.message : "Failed to send.";
          toast.error(msg);
          return;
        }
        toast.success("Message sent! We'll reply within one business day.");
        setName("");
        setEmail("");
        setSubject("");
        setMessage("");
        setCategory("general");
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [category, email, loading, message, name, subject],
  );

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to us"
        subtitle="Sales, support, partnerships, press, or security — we read every message and reply within one business day."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <form
          onSubmit={onSubmit}
          className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:p-8"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
                placeholder="Ada Lovelace"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-email">Email *</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-subject">Subject</Label>
              <Input
                id="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={loading}
                placeholder="How can we help?"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-category">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={loading}>
                <SelectTrigger id="contact-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-message">Message *</Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              required
              rows={6}
              placeholder="Tell us what you're building, your team size, and what you need…"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              By submitting, you agree to our Privacy Policy.
            </p>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Send className="mr-1.5 size-3.5" />
              {loading ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
