"use client";

/**
 * Supa AI — Section router.
 *
 * The single client component that owns the active dashboard section state
 * and renders either the user overview, the foundation dashboard, the
 * settings panel, or a "coming soon" placeholder for sections that haven't
 * shipped yet. It also wires the section state into the `DashboardShell`
 * so the sidebar highlight and the ⌘K command palette can drive navigation.
 *
 * Sections:
 *
 *   - `overview`  — the user dashboard landing (DEFAULT when authenticated).
 *                   Requires a `DashboardData` snapshot passed as the
 *                   `dashboardData` prop. If absent (e.g. the orchestrator
 *                   hasn't wired `getDashboardData()` yet), the router
 *                   falls back to the foundation dashboard so the page
 *                   still renders.
 *   - `dashboard` — the Phase 1 foundation dashboard (system status).
 *                   Renders from the existing `FoundationData` snapshot.
 *   - `settings`  — the settings panel (also from `FoundationData`).
 *   - everything else — a "coming soon" `EmptyState`.
 *
 * Keeping this as a small, dedicated client island lets the surrounding
 * `src/app/page.tsx` stay a server component (so the heavy
 * `flagService.listFlags()` / `ai.listAvailable()` calls happen on the
 * server and never leak to the client bundle).
 *
 * @module @/components/dashboard/section-router
 */
import * as React from "react";
import { Construction } from "lucide-react";

import type { AuthUser, DashboardData } from "@/lib/auth";
import type { FoundationData } from "@/components/dashboard/foundation-data";
import { EmptyState } from "@/components/shared/empty-state";
import { ComingSoon } from "@/components/shared/coming-soon";
import { DashboardShell } from "./dashboard-shell";
import { DashboardOverview } from "./dashboard-overview";
import { UserOverview } from "./user-overview";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { AdminOverview } from "@/components/admin/admin-overview";
import { ChatView } from "@/components/chat";
import { EmployeesView } from "@/components/employees";
import { ImageView } from "@/components/image";
import { VideoView } from "@/components/video";
import { VoiceView } from "@/components/voice";
import { WorkspaceView } from "@/components/workspace";
import { BuilderView } from "@/components/builder";
import { AutomationView } from "@/components/automation";
import { BusinessView } from "@/components/business";
import { IntegrationsView } from "@/components/integrations";
import { RuntimeView } from "@/components/runtime";
import {
  DASHBOARD_NAV,
  type SectionId,
} from "./nav-config";

export interface SectionRouterProps {
  user: AuthUser | null;
  data: FoundationData;
  /**
   * Aggregated user-dashboard snapshot (from
   * `profileService.getDashboardData(userId)`). When present, the router
   * renders the post-login `UserOverview` as the default landing section.
   * When absent, the router falls back to the Phase 1 foundation
   * dashboard so the page still renders something useful.
   */
  dashboardData?: DashboardData;
  /** Optional initial section (e.g. `?section=settings`). */
  initialSection?: SectionId;
}

const SECTION_TITLE: Partial<Record<SectionId, { title: string; description: string }>> = {
  chat: {
    title: "AI Chat",
    description: "Conversational AI assistant with streaming, tool calling, and conversation history.",
  },
  image: {
    title: "Image Generation",
    description: "Generate images from text prompts using multiple providers.",
  },
  video: {
    title: "AI Video Generation",
    description: "Generate videos from text or image prompts across 8 providers.",
  },
  voice: {
    title: "Voice & Audio",
    description: "Text-to-speech, speech-to-text, translation, dubbing, and voice cloning.",
  },
  marketplace: {
    title: "Marketplace",
    description: "Browse, publish, and monetize AI tools built by the community.",
  },
  "business-tools": {
    title: "Business Tools",
    description: "Workflows and automations for teams and businesses.",
  },
  business: {
    title: "Business",
    description:
      "CRM, invoicing, contracts, inventory, projects — the all-in-one business suite.",
  },
  integrations: {
    title: "Integrations",
    description:
      "Connect external apps and services — marketplace, OAuth, webhooks, sync.",
  },
  billing: {
    title: "Billing",
    description: "Plans, usage, payment methods, and invoices.",
  },
  team: {
    title: "Team",
    description: "Members, roles, and invitations.",
  },
  admin: {
    title: "Admin",
    description: "Provider health, usage metrics, and the model catalog.",
  },
  workspace: {
    title: "Workspaces",
    description:
      "Team workspaces — documents, knowledge base, members, comments, files.",
  },
  automation: {
    title: "Automation",
    description:
      "Build workflows, triggers, actions, and webhook automations.",
  },
  "workflow-builder": {
    title: "Workflow Builder",
    description:
      "Visual canvas for designing multi-step workflows — drag, connect, and debug nodes.",
  },
  runtime: {
    title: "Runtime",
    description:
      "Supa OS Runtime — manage sessions, processes, tasks, schedules, events, logs, resources, and recovery.",
  },
};

export function SectionRouter({
  user,
  data,
  dashboardData,
  initialSection,
}: SectionRouterProps) {
  // Resolve the initial section:
  //   - Honor an explicit `initialSection` prop (e.g. deep link).
  //   - Default to `'overview'` when the user is authenticated AND the
  //     dashboard snapshot is available — the user overview is the
  //     post-login landing surface.
  //   - Fall back to `'dashboard'` (the foundation system-status surface)
  //     when there's no user dashboard data — keeps the page useful even
  //     before the orchestrator wires `getDashboardData()`.
  const defaultSection: SectionId =
    dashboardData && user ? "overview" : "dashboard";
  const [active, setActive] = React.useState<SectionId>(
    initialSection ?? defaultSection,
  );

  // If the user is signed out mid-session (e.g. session expired), the
  // overview surface is no longer reachable — bounce back to the
  // foundation dashboard so we never render the user overview with a
  // missing `dashboardData`.
  React.useEffect(() => {
    if (active === "overview" && !dashboardData) {
      setActive("dashboard");
    }
  }, [active, dashboardData]);

  return (
    <DashboardShell
      user={user}
      activeSection={active}
      onSectionChange={setActive}
      environment={data.environment}
    >
      <SectionContent
        active={active}
        data={data}
        dashboardData={dashboardData}
        user={user}
        email={user?.email ?? null}
        onEditProfile={() => setActive("settings")}
      />
    </DashboardShell>
  );
}

interface SectionContentProps {
  active: SectionId;
  data: FoundationData;
  dashboardData?: DashboardData;
  user: AuthUser | null;
  email: string | null;
  onEditProfile: () => void;
}

function SectionContent({
  active,
  data,
  dashboardData,
  user,
  email,
  onEditProfile,
}: SectionContentProps) {
  // User dashboard overview (Phase 2 landing).
  if (active === "overview") {
    if (dashboardData) {
      return (
        <UserOverview
          data={dashboardData}
          email={email}
          onEditProfile={onEditProfile}
        />
      );
    }
    // No dashboard data yet — fall back to the foundation dashboard so
    // the page still renders something useful.
    return <DashboardOverview data={data} />;
  }

  // Foundation system-status dashboard (Phase 1).
  if (active === "dashboard") {
    return <DashboardOverview data={data} />;
  }

  if (active === "settings") {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <SettingsPanel
          data={data}
          dashboardData={dashboardData}
          userEmail={email}
        />
      </div>
    );
  }

  // Phase 3 admin monitoring dashboard. The AdminOverview component
  // gates access by platform role and renders a friendly locked state
  // for unauthorized users (so the sidebar item is safe to show to
  // everyone).
  if (active === "admin") {
    return <AdminOverview user={user} />;
  }

  // Phase 3 AI chat surface. Full-screen two-pane layout (sidebar +
  // chat window) with real SSE streaming against `/api/chat/*`.
  if (active === "chat") {
    return <ChatView />;
  }

  // Phase 4 AI Image Generation surface. Tabbed container: Generate,
  // Gallery, Models, Usage.
  if (active === "image") {
    return <ImageView />;
  }

  // Phase 9C AI Employees surface.
  if (active === "employees") {
    return <EmployeesView />;
  }

  // Phase 5 AI Video surface. Tabbed container: Generate, Gallery,
  // Jobs, Usage. Generate kicks off an async job via the background
  // queue; the gallery polls while jobs are in flight.
  if (active === "video") {
    return <VideoView />;
  }

  // Phase 9 Workspace & Collaboration surface. Tabbed container:
  // Dashboard, Documents, Members, Knowledge. Documents pane splits
  // into folder tree (left) + editor (center) + version history +
  // comments (right).
  if (active === "workspace") {
    return <WorkspaceView />;
  }

  // Phase 8 AI Voice surface. Tabbed container: Synthesize (TTS),
  // Transcribe (STT), Library, Profiles, Usage. Long-running ops
  // (translate / dub / clone) schedule a background job via
  // setImmediate and return immediately so the client can poll.
  if (active === "voice") {
    return <VoiceView />;
  }

  // Phase 9A Automation Engine surface. Tabbed container: Workflows,
  // Runs, Templates, Dashboard. Workflows are workspace-scoped;
  // triggers fire on schedule/event/webhook/manual/api.
  if (active === "automation") {
    return <AutomationView />;
  }

  // Phase 9B Visual Workflow Builder surface. Three-pane layout:
  // node palette (left) + canvas (center) + tabbed right sidebar
  // (config / debug / comments / versions).
  if (active === "workflow-builder") {
    return <BuilderView />;
  }

  // Phase 10 Business AI Suite surface. Tabbed container: Dashboard,
  // CRM, Invoices, Projects, Calendar, Reports, AI Assistant.
  // Workspace-scoped — picks the first workspace if none is active.
  if (active === "business") {
    return <BusinessView />;
  }

  // Phase 10 Integration Hub surface. Tabbed container: Marketplace,
  // Installed, Health, Logs, Analytics, Webhooks.
  if (active === "integrations") {
    return <IntegrationsView />;
  }

  // Phase 12 Supa OS Runtime surface. Tabbed container: Dashboard,
  // Processes, Tasks, Schedules, Events, Logs, Resources, Recovery.
  if (active === "runtime") {
    return <RuntimeView />;
  }

  // Everything else is a "coming soon" surface.
  const meta = SECTION_TITLE[active];
  const navItem = DASHBOARD_NAV.flatMap((g) => g.items).find((i) => i.id === active);
  const title = meta?.title ?? navItem?.label ?? "Coming soon";
  const description = meta?.description ?? navItem?.description ?? "";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <ComingSoon />
      </div>
      <EmptyState
        icon={Construction}
        title={`${title} isn't built yet`}
        description={
          description
            ? `${description} This surface ships in Phase 2 — the foundation modules it depends on are already in place.`
            : "This surface ships in a later phase. The foundation modules it depends on are already in place."
        }
      />
    </div>
  );
}
