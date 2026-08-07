"use client";

/**
 * Supa AI — About page.
 *
 * Mission, values, and company facts. Pure marketing content with no
 * external dependencies.
 *
 * @module @/components/marketing/pages/about-page
 */
import * as React from "react";
import { Heart, Target, Eye, Globe, Lock, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../sections/page-header";

const VALUES = [
  {
    icon: Lock,
    title: "Privacy by default",
    body: "We never train on customer data. We never sell it. We never share it. Self-host for full air-gap control.",
  },
  {
    icon: Globe,
    title: "Open standards",
    body: "We build on Supabase (Postgres, Auth, Storage) — the open-source stack you already know. No vendor lock-in.",
  },
  {
    icon: Heart,
    title: "Developer-first",
    body: "Every feature ships with typed APIs, audit logs, and a public roadmap. Built by developers, for developers.",
  },
  {
    icon: Users,
    title: "Customer-obsessed",
    body: "We answer every support ticket within one business day. We ship features based on what you ask for.",
  },
] as const;

const FACTS = [
  { label: "Founded", value: "2024" },
  { label: "Headquarters", value: "Remote-first" },
  { label: "Stack", value: "Next.js + Supabase" },
  { label: "License", value: "BSL → Apache 2.0" },
  { label: "Self-hostable", value: "Yes" },
  { label: "Customers", value: "Teams in 30+ countries" },
] as const;

export function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="The enterprise AI platform that respects you"
        subtitle="We're a small team building the AI platform we wish existed: open-source-friendly, self-hostable, multi-provider, and privacy-respecting."
      />

      {/* Mission */}
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mx-auto dark:bg-emerald-950/50 dark:text-emerald-300">
            <Target className="size-6" />
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Our mission</h2>
          <p className="mt-4 text-base text-muted-foreground">
            Give every team access to production-grade AI tooling without
            locking them into a single provider, a single cloud, or a single
            billing model. The future of AI is open, multi-provider, and
            self-hostable — we're building the platform that delivers it.
          </p>
        </div>
      </section>

      {/* Vision */}
      <section className="bg-muted/30 py-12">
        <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mx-auto dark:bg-emerald-950/50 dark:text-emerald-300">
            <Eye className="size-6" />
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Our vision</h2>
          <p className="mt-4 text-base text-muted-foreground">
            A world where every business — from a 2-person startup to a
            Fortune 500 — can run their entire AI stack on infrastructure
            they control, with models from any provider, billed the way they
            want, with audit logs they own.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          What we value
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => {
            const Icon = value.icon;
            return (
              <Card key={value.title}>
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="mt-2 text-base">{value.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{value.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Facts */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Company facts
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map((fact) => (
            <Card key={fact.label}>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{fact.label}</span>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {fact.value}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
