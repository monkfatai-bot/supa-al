/**
 * Supa AI — Dashboard navigation config.
 *
 * The marketing `APP_NAVIGATION` (in `@/lib/constants/app`) is a flat list of
 * label/href pairs for the public site. The *dashboard* shell needs richer
 * metadata — grouped items with section IDs, enablement flags, and
 * "coming soon" markers — so the sidebar can render collapsible groups and
 * the section-router can switch the in-page view without changing the URL.
 *
 * Each item carries an `id` that the section-router switches on. Items that
 * are not yet built set `comingSoon: true` so they render disabled with a
 * "Phase 2" badge — the user always gets an honest signal about what is and
 * isn't wired up yet.
 *
 * @module @/components/dashboard/nav-config
 */
import {
  Activity,
  BookOpen,
  Bot,
  Briefcase,
  Cpu,
  CreditCard,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Mic,
  Plug,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Video,
  Workflow,
  Zap,
} from "lucide-react";

/**
 * In-page section identifiers rendered inside the `/` route.
 *
 *   - `overview`  — the user dashboard landing (Phase 2). DEFAULT when
 *                   authenticated. Shows the user's account snapshot.
 *   - `dashboard` — the Phase 1 foundation dashboard (system status /
 *                   environment health). Renamed "System Status" in the
 *                   sidebar so users can distinguish the two surfaces.
 *   - `admin`     — the Phase 3 admin monitoring dashboard (provider
 *                   health, usage, model catalog). Rendered for everyone
 *                   in the sidebar; the {@link AdminOverview} component
 *                   gates access by platform role and shows a friendly
 *                   "You need admin access" state for unauthorized users.
 *   - `video`     — the Phase 5 AI Video Generation surface (prompt-
 *                   driven text-to-video + image-to-video across 8
 *                   providers, with a gallery, background job monitor,
 *                   and per-month usage summary).
 *   - `voice`     — the Phase 8 AI voice platform (TTS, STT, translation,
 *                   dubbing, voice cloning). Renders a tabbed surface
 *                   with a synthesizer, transcriber, library, profile
 *                   manager, and usage card.
 *   - `workspace` — the Phase 9 Workspace & Collaboration surface
 *                   (workspaces, members, documents, knowledge, comments,
 *                   files, global search).
 *   - `automation` — the Phase 9A Automation Engine surface (workflows,
 *                   triggers, actions, runs, logs, variables, templates,
 *                   and a public webhook receiver).
 */
export type SectionId =
  | "overview"
  | "dashboard"
  | "chat"
  | "image"
  | "video"
  | "marketplace"
  | "business"
  | "business-tools"
  | "settings"
  | "billing"
  | "team"
  | "admin"
  | "employees"
  | "workspace"
  | "voice"
  | "automation"
  | "workflow-builder"
  | "integrations"
  | "runtime";

/** A single dashboard navigation entry. */
export interface DashboardNavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  description?: string;
  /** Render disabled + show a "Phase 2" badge. */
  comingSoon?: boolean;
  /** Render disabled with no badge — used for items gated by another flag. */
  disabled?: boolean;
}

/** A collapsible group of nav items shown under a heading. */
export interface DashboardNavGroup {
  /** Group heading — e.g. "Workspace", "AI Tools", "Account". */
  label: string;
  items: readonly DashboardNavItem[];
}

/** The dashboard sidebar's navigation tree. */
export const DASHBOARD_NAV: readonly DashboardNavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        id: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        description: "Your account at a glance — plan, credits, activity",
      },
      {
        id: "dashboard",
        label: "System Status",
        icon: Activity,
        description: "Foundation status + system health",
      },
      {
        id: "workspace",
        label: "Workspaces",
        icon: FolderKanban,
        description: "Team workspaces — documents, knowledge, members, comments",
      },
    ],
  },
  {
    label: "AI Tools",
    items: [
      {
        id: "chat",
        label: "Chat",
        icon: MessageSquare,
        description: "Conversational AI assistant",
      },
      {
        id: "image",
        label: "Image Generation",
        icon: ImageIcon,
        description: "Generate images from text prompts",
      },
      {
        id: "video",
        label: "Video Generation",
        icon: Video,
        description: "Generate videos from text or image prompts across 8 providers",
      },
      {
        id: "voice",
        label: "Voice & Audio",
        icon: Mic,
        description: "Text-to-speech, speech-to-text, translation, dubbing, cloning",
      },
      {
        id: "automation",
        label: "Automation",
        icon: Zap,
        description: "Build workflows, triggers, actions, and webhook automations",
      },
      {
        id: "workflow-builder",
        label: "Workflow Builder",
        icon: Workflow,
        description:
          "Visual canvas for designing multi-step workflows — drag, connect, and debug nodes",
      },
      {
        id: "business",
        label: "Business",
        icon: Briefcase,
        description: "CRM, invoicing, contracts, inventory, projects",
      },
      {
        id: "integrations",
        label: "Integrations",
        icon: Plug,
        description: "Connect external apps and services",
      },
      {
        id: "runtime",
        label: "Runtime",
        icon: Cpu,
        description: "Supa OS Runtime — manage agents, tasks, and processes",
      },
      {
        id: "marketplace",
        label: "Marketplace",
        icon: Store,
        description: "Browse and publish AI tools",
        comingSoon: true,
      },
      {
        id: "business-tools",
        label: "Business Tools",
        icon: Briefcase,
        description: "Workflows for teams and businesses",
        comingSoon: true,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        description: "General, appearance, providers, billing, security",
      },
      {
        id: "billing",
        label: "Billing",
        icon: CreditCard,
        description: "Plans, usage, payment methods",
        comingSoon: true,
      },
      {
        id: "team",
        label: "Team",
        icon: Users,
        description: "Members, roles, invitations",
        comingSoon: true,
      },
      {
        id: "admin",
        label: "Admin",
        icon: ShieldCheck,
        description:
          "Provider health, usage metrics, model catalog (admin only)",
      },
      {
        id: "employees",
        label: "AI Employees",
        icon: Bot,
        description: "Hire, train, and collaborate with AI employees",
      },
    ],
  },
];

/** Doc / external links rendered at the bottom of the sidebar. */
export const SIDEBAR_FOOTER_LINKS: readonly {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
}[] = [
  {
    label: "Documentation",
    href: "/docs",
    icon: BookOpen,
  },
];
