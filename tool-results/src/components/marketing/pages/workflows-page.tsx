"use client";

/**
 * Supa AI — Workflows page.
 *
 * Marketing page for the Workflow Builder pillar. Highlights the 71 node
 * types, visual canvas, debug mode, and a CTA.
 *
 * @module @/components/marketing/pages/workflows-page
 */
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Workflow as WorkflowIcon,
  Zap,
  GitBranch,
  Bug,
  Users,
  Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../sections/page-header";

const FEATURES = [
  {
    icon: Zap,
    title: "71 node types",
    body: "Triggers, actions, conditions, transforms, AI steps, integrations, and outputs — all out of the box.",
  },
  {
    icon: GitBranch,
    title: "Visual canvas",
    body: "Pan, zoom, drag, connect. Build complex graphs without writing code.",
  },
  {
    icon: Bug,
    title: "Debug mode",
    body: "Step through runs, inspect variables, replay from any node. Ship with confidence.",
  },
  {
    icon: Eye,
    title: "In-memory preview",
    body: "Test workflows end-to-end without touching production data.",
  },
  {
    icon: Users,
    title: "Real-time collaboration",
    body: "See teammates' cursors, leave comments, resolve threads — all in the canvas.",
  },
  {
    icon: WorkflowIcon,
    title: "Variable resolver",
    body: "`{{key}}`, `{{a.b.c}}`, `{{outputs.N.x}}`, `{{payload.event}}` — deep path support everywhere.",
  },
] as const;

const CATEGORIES = [
  { label: "Triggers", count: 4 },
  { label: "Actions", count: 9 },
  { label: "Conditions", count: 3 },
  { label: "Transforms", count: 4 },
  { label: "AI", count: 5 },
  { label: "Integrations", count: 38 },
  { label: "Outputs", count: 8 },
] as const;

export function WorkflowsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workflow Builder"
        title="Visual canvas for multi-step automation"
        subtitle="Drag triggers, conditions, transforms, AI steps, and 38 integrations onto a pan/zoom canvas. Debug, preview, and ship without leaving the page."
      />

      {/* Features grid */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="mt-2 text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Node category breakdown */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            71 node types, organized
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((cat) => (
              <Card key={cat.label}>
                <CardContent className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{cat.label}</span>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {cat.count}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Build your first workflow in minutes
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Free tier includes 1 workflow. Pro unlocks unlimited workflows.
          </p>
          <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Link href="/?signup=1">
              Start free
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
