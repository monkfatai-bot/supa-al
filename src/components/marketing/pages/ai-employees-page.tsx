"use client";

/**
 * Supa AI — AI Employees page.
 *
 * Static marketing page for the AI Employees pillar. Shows the value
 * proposition, department breakdown, and a CTA.
 *
 * @module @/components/marketing/pages/ai-employees-page
 */
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Briefcase,
  MessageSquare,
  Headphones,
  TrendingUp,
  Code2,
  PenTool,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "../sections/page-header";

const DEPARTMENTS = [
  { icon: Briefcase, name: "Sales", description: "SDRs, AEs, account managers. Qualify leads, draft emails, schedule demos." },
  { icon: Headphones, name: "Support", description: "Tier-1 + tier-2 agents. Resolve tickets, draft responses, escalate." },
  { icon: TrendingUp, name: "Growth", description: "SEO, content, ads. Generate briefs, optimize copy, analyze funnels." },
  { icon: PenTool, name: "Marketing", description: "Brand, social, lifecycle. Draft posts, schedule campaigns, A/B test." },
  { icon: Code2, name: "Engineering", description: "Code review, debugging, refactoring. PR summaries, test generation." },
  { icon: MessageSquare, name: "Operations", description: "Finance, HR, ops. Invoices, expenses, onboarding, reporting." },
] as const;

const CAPABILITIES = [
  { label: "Train on URLs", description: "Paste a docs URL and your employee learns the content." },
  { label: "Long-term memory", description: "Each employee remembers context across conversations + assignments." },
  { label: "Skills registry", description: "Attach structured skills (CRM lookup, email send, etc.) to each role." },
  { label: "Versioning + clone", description: "Iterate safely — clone an employee, A/B test, ship the winner." },
  { label: "Inter-employee messaging", description: "Employees hand off work to each other across departments." },
  { label: "Performance tracking", description: "Per-employee token usage, response time, and resolution rate." },
] as const;

export function AiEmployeesPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI Employees"
        title="Hire AI teammates in seconds"
        subtitle="Role-specialized AI agents with memory, skills, and assignments. Spin up a sales SDR, a support tier-1, or a code reviewer in under a minute."
      />

      {/* Departments grid */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Pre-built departments
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
          Start from a template or build your own. Each department ships with
          skills, prompts, and onboarding flows.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((dept) => {
            const Icon = dept.icon;
            return (
              <Card key={dept.name}>
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="mt-2 text-lg">{dept.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{dept.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Capabilities */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-600 text-white mx-auto">
              <Bot className="size-6" />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              What every employee gets
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The full toolkit, out of the box — no setup required.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap) => (
              <div key={cap.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">{cap.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Hire your first AI employee today
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Free tier includes 100 chat messages / month. Pro tier unlocks 5 employees.
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
