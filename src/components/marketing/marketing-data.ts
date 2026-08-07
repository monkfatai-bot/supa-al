/**
 * Supa AI — Marketing copy + content catalog (client-safe).
 *
 * All static marketing copy lives here so the rest of the marketing UI can
 * stay declarative + thin. Brand color is emerald (no indigo, no blue).
 *
 * @module @/components/marketing/marketing-data
 */
import type { LucideIcon } from "lucide-react";
import {
  MessageSquare,
  Image as ImageIcon,
  Mic,
  Video,
  Bot,
  Workflow,
  Store,
  Briefcase,
  Plug,
  ShieldCheck,
  Zap,
  Sparkles,
  Lock,
  Globe,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

export type MarketingViewId =
  | "home"
  | "products"
  | "pricing"
  | "blog"
  | "docs"
  | "marketplace"
  | "ai-employees"
  | "workflows"
  | "integrations"
  | "contact"
  | "about"
  | "changelog";

export interface MarketingNavItem {
  id: MarketingViewId;
  label: string;
  href: string;
}

export const MARKETING_NAV_ITEMS: readonly MarketingNavItem[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "products", label: "Products", href: "/?view=products" },
  { id: "pricing", label: "Pricing", href: "/?view=pricing" },
  { id: "blog", label: "Blog", href: "/?view=blog" },
  { id: "docs", label: "Docs", href: "/?view=docs" },
  { id: "changelog", label: "Changelog", href: "/?view=changelog" },
];

// ---------------------------------------------------------------------------
// Products (AI Platform Overview)
// ---------------------------------------------------------------------------

export interface MarketingProduct {
  id: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  accent: string; // tailwind text color class (emerald family only)
  href: string;
  view: MarketingViewId;
}

export const MARKETING_PRODUCTS: readonly MarketingProduct[] = [
  {
    id: "chat",
    icon: MessageSquare,
    title: "AI Chat",
    tagline: "Multi-provider chat workspace",
    description:
      "Switch between OpenAI, Anthropic, Google, DeepSeek, Qwen, Grok, and OpenRouter mid-conversation. Streaming, tool calling, prompt templates, and full history.",
    features: ["7 providers", "Streaming", "Tool calling", "Prompt templates"],
    accent: "text-emerald-600",
    href: "/?view=ai-employees",
    view: "ai-employees",
  },
  {
    id: "images",
    icon: ImageIcon,
    title: "Image Generation",
    tagline: "8 providers, one studio",
    description:
      "Generate images with Stability, OpenAI, Replicate, Ideogram, Google, Fal, and more. Upscale, remove background, enhance, and manage a private gallery.",
    features: ["8 providers", "Upscale", "Remove-bg", "Gallery"],
    accent: "text-emerald-600",
    href: "/?view=ai-employees",
    view: "ai-employees",
  },
  {
    id: "voice",
    icon: Mic,
    title: "Voice",
    tagline: "TTS, transcription, dubbing",
    description:
      "Synthesize natural speech with ElevenLabs, OpenAI, Cartesia, Azure, Deepgram, PlayHT, and Google. Transcribe, translate, and clone voices.",
    features: ["7 providers", "Clone", "Dub", "Transcribe"],
    accent: "text-emerald-600",
    href: "/?view=ai-employees",
    view: "ai-employees",
  },
  {
    id: "video",
    icon: Video,
    title: "Video Generation",
    tagline: "8 providers, queue + storage",
    description:
      "Runway, Kling, Luma, Pika, Replicate, Fal, Google, and OpenAI. Background job queue, signed URLs, and a searchable history.",
    features: ["8 providers", "Job queue", "Signed URLs", "History"],
    accent: "text-emerald-600",
    href: "/?view=ai-employees",
    view: "ai-employees",
  },
  {
    id: "employees",
    icon: Bot,
    title: "AI Employees",
    tagline: "Hire, train, and deploy",
    description:
      "Spin up role-specialized AI employees (sales, support, ops). Train them on URLs, give them memory, skills, and assignments. Marketplace for shared templates.",
    features: ["Departments", "Training", "Memory", "Marketplace"],
    accent: "text-emerald-600",
    href: "/?view=ai-employees",
    view: "ai-employees",
  },
  {
    id: "workflows",
    icon: Workflow,
    title: "Workflow Builder",
    tagline: "Visual automation canvas",
    description:
      "Drag-and-drop 71 node types — triggers, conditions, transforms, AI steps, integrations — onto a pan/zoom canvas. Debug, preview, and ship.",
    features: ["71 node types", "Visual canvas", "Debug mode", "Preview"],
    accent: "text-emerald-600",
    href: "/?view=workflows",
    view: "workflows",
  },
];

// ---------------------------------------------------------------------------
// Product Showcase tabs (5 tabs)
// ---------------------------------------------------------------------------

export interface ShowcaseTab {
  id: string;
  label: string;
  title: string;
  description: string;
  bullets: string[];
}

export const SHOWCASE_TABS: readonly ShowcaseTab[] = [
  {
    id: "ai-employees",
    label: "AI Employees",
    title: "Hire AI teammates in seconds",
    description:
      "Spin up role-specialized AI employees for sales, support, ops, marketing, finance, and engineering. Each one carries memory, skills, and a department.",
    bullets: [
      "Pre-built departments and templates",
      "Train on URLs, files, or pasted text",
      "Long-term + workspace memory",
      "Versioning + clone to iterate safely",
      "Internal marketplace for shared templates",
    ],
  },
  {
    id: "workflow-builder",
    label: "Workflow Builder",
    title: "Visual canvas for multi-step automation",
    description:
      "Drag triggers, conditions, transforms, AI steps, and 38 integrations onto a pan/zoom canvas. Debug, preview, and ship without leaving the page.",
    bullets: [
      "71 node types across 7 categories",
      "Triggers: schedule, event, webhook, manual",
      "Variable resolver with deep-path support",
      "Real-time collaboration with presence cursors",
      "In-memory preview + graph validation",
    ],
  },
  {
    id: "business-ai",
    label: "Business AI",
    title: "Run your business on AI",
    description:
      "CRM, invoices, quotes, proposals, contracts, expenses, accounting, calendar, and reports — all in one workspace, with an AI assistant wired into every page.",
    bullets: [
      "Full CRM with leads + opportunities",
      "Invoices, quotes, proposals, contracts",
      "Accounting + expense tracking",
      "Calendar + project management",
      "AI assistant on every record",
    ],
  },
  {
    id: "integration-hub",
    label: "Integration Hub",
    title: "Connect 100+ apps without code",
    description:
      "OAuth2, API-key, and webhook-based integrations with bi-directional sync. Monitor webhooks, run sync jobs, and trigger workflows on incoming events.",
    bullets: [
      "100+ pre-built connectors",
      "OAuth2, API-key, basic, webhook",
      "Bi-directional sync jobs",
      "Webhook subscriptions + retries",
      "Real-time event router",
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    title: "Browse, install, publish",
    description:
      "A community marketplace for AI employees, workflow templates, integration connectors, and node packs. Install in one click, rate what you love, publish your own.",
    bullets: [
      "One-click install",
      "Versioned, reviewable publishes",
      "Ratings + reviews",
      "Featured collections curated weekly",
      "Revenue share for publishers",
    ],
  },
];

// ---------------------------------------------------------------------------
// Pricing (5 tiers)
// ---------------------------------------------------------------------------

export interface PricingTier {
  id: string;
  name: string;
  monthly: number; // USD
  yearly: number; // USD per year (≈ 2 months free)
  tagline: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
  custom: boolean;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    tagline: "For evaluation and side projects",
    features: [
      "1 workspace, 1 seat",
      "100 chat messages / month",
      "10 image generations / month",
      "All 7 AI providers (BYO key)",
      "Community support",
    ],
    cta: "Start free",
    href: "/?signup=1",
    highlighted: false,
    custom: false,
  },
  {
    id: "starter",
    name: "Starter",
    monthly: 19,
    yearly: 190,
    tagline: "For individuals shipping in production",
    features: [
      "1 workspace, 3 seats",
      "5,000 chat messages / month",
      "500 image generations / month",
      "Voice + video generation",
      "Email support",
    ],
    cta: "Start Starter",
    href: "/?signup=1",
    highlighted: false,
    custom: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 49,
    yearly: 490,
    tagline: "For teams that need AI in their daily flow",
    features: [
      "3 workspaces, 10 seats",
      "25,000 chat messages / month",
      "2,500 image generations / month",
      "AI Employees (5)",
      "Workflow Builder (unlimited)",
      "Priority support",
    ],
    cta: "Start Pro",
    href: "/?signup=1",
    highlighted: true,
    custom: false,
  },
  {
    id: "business",
    name: "Business",
    monthly: 149,
    yearly: 1490,
    tagline: "For organizations running on AI",
    features: [
      "Unlimited workspaces, 50 seats",
      "150,000 chat messages / month",
      "15,000 image generations / month",
      "AI Employees (unlimited)",
      "Business AI suite (CRM, invoicing)",
      "Integration Hub (100+ connectors)",
      "SSO + audit logs",
    ],
    cta: "Start Business",
    href: "/?signup=1",
    highlighted: false,
    custom: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 0,
    yearly: 0,
    tagline: "For regulated industries + self-hosters",
    features: [
      "Self-host on Supabase",
      "Custom contracts + SLAs",
      "Dedicated support engineer",
      "Custom integrations",
      "On-prem AI provider routing",
      "SOC 2 / HIPAA playbooks",
    ],
    cta: "Talk to sales",
    href: "/?view=contact",
    highlighted: false,
    custom: true,
  },
];

// ---------------------------------------------------------------------------
// Stats (animated counters)
// ---------------------------------------------------------------------------

export interface MarketingStat {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  description: string;
}

export const MARKETING_STATS: readonly MarketingStat[] = [
  { label: "AI providers", value: 7, suffix: "", description: "OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Qwen, Grok." },
  { label: "Image providers", value: 8, suffix: "", description: "Stability, OpenAI, Replicate, Ideogram, Google, Fal, and more." },
  { label: "Workflow node types", value: 71, suffix: "", description: "Triggers, actions, conditions, transforms, AI, integrations, outputs." },
  { label: "Built-in integrations", value: 100, suffix: "+", description: "OAuth2, API-key, basic, and webhook-based connectors." },
];

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  initials: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "Supa AI replaced six separate subscriptions. Chat, images, voice, automation — all in one workspace with one bill.",
    name: "Maya Okonkwo",
    role: "Head of Growth",
    company: "Northwind Labs",
    initials: "MO",
  },
  {
    quote:
      "We hired three AI employees for customer support and they handle 80% of tier-1 tickets. Escalation is seamless.",
    name: "Daniel Vargas",
    role: "VP Customer Experience",
    company: "Tessellate",
    initials: "DV",
  },
  {
    quote:
      "The Workflow Builder is the first automation tool my whole team actually uses. The visual canvas is brilliant.",
    name: "Priya Iyer",
    role: "Operations Lead",
    company: "Cascade",
    initials: "PI",
  },
  {
    quote:
      "Self-hosting on Supabase was a 30-minute job. No vendor lock-in, no surprise bills, full control of our data.",
    name: "Lucas Meyer",
    role: "CTO",
    company: "Bracken",
    initials: "LM",
  },
  {
    quote:
      "The Integration Hub saved us 6 months of engineering. We connected HubSpot + Slack + Linear in an afternoon.",
    name: "Aisha Bello",
    role: "RevOps Manager",
    company: "Ledgerline",
    initials: "AB",
  },
  {
    quote:
      "Best AI platform I've used in 2024. The multi-provider chat alone is worth the subscription.",
    name: "Theo Nakamura",
    role: "Founder",
    company: "Sundial",
    initials: "TN",
  },
];

// ---------------------------------------------------------------------------
// Trusted-by logos (text-based, no external assets)
// ---------------------------------------------------------------------------

export const TRUSTED_BY: readonly string[] = [
  "Northwind Labs",
  "Tessellate",
  "Cascade",
  "Bracken",
  "Ledgerline",
  "Sundial",
  "Quartz",
  "Mirador",
];

// ---------------------------------------------------------------------------
// Feature comparison
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  feature: string;
  free: boolean | string;
  starter: boolean | string;
  pro: boolean | string;
  business: boolean | string;
  enterprise: boolean | string;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { feature: "AI providers", free: "7", starter: "7", pro: "7", business: "7 + custom", enterprise: "7 + custom" },
  { feature: "Chat messages / month", free: "100", starter: "5K", pro: "25K", business: "150K", enterprise: "Custom" },
  { feature: "Image generations / month", free: "10", starter: "500", pro: "2.5K", business: "15K", enterprise: "Custom" },
  { feature: "Voice + video generation", free: false, starter: true, pro: true, business: true, enterprise: true },
  { feature: "AI Employees", free: false, starter: false, pro: "5", business: "Unlimited", enterprise: "Unlimited" },
  { feature: "Workflow Builder", free: "1 workflow", starter: "10 workflows", pro: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  { feature: "Business AI suite", free: false, starter: false, pro: false, business: true, enterprise: true },
  { feature: "Integration Hub", free: false, starter: "5 connectors", pro: "25 connectors", business: "100+ connectors", enterprise: "Custom" },
  { feature: "Marketplace", free: "Browse", starter: "Browse + install", pro: "Browse + install", business: "Browse + install + publish", enterprise: "Browse + install + publish" },
  { feature: "SSO + SAML", free: false, starter: false, pro: false, business: true, enterprise: true },
  { feature: "Audit logs", free: false, starter: false, pro: "30 days", business: "1 year", enterprise: "Custom retention" },
  { feature: "Self-hosting", free: true, starter: true, pro: true, business: true, enterprise: true },
];

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: "Can I bring my own API keys?",
    answer:
      "Yes. Every AI provider (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Qwen, Grok) accepts your own API key — your usage never touches our billing. Bring keys at the workspace or per-user level.",
  },
  {
    question: "Can I self-host?",
    answer:
      "Yes. Supa AI runs on your own Supabase project — the open-source Postgres + Auth + Storage stack. Clone the repo, set env vars, run migrations, and you have a fully-featured AI platform under your domain.",
  },
  {
    question: "How does the Free tier work?",
    answer:
      "The Free tier gives you 1 workspace, 1 seat, 100 chat messages, and 10 image generations per month. Bring your own AI provider keys. No credit card required. Upgrade anytime; downgrade anytime.",
  },
  {
    question: "What is an AI Employee?",
    answer:
      "An AI Employee is a role-specialized AI agent (sales, support, ops, etc.) with memory, skills, and assignments. You train them on URLs or files, give them a department, and they can be assigned tasks, take messages, and hand off to teammates.",
  },
  {
    question: "How does the Workflow Builder differ from Zapier?",
    answer:
      "Supa AI's Workflow Builder is a visual canvas with 71 node types — triggers, conditions, transforms, AI steps, integrations, and outputs. You get a debug mode, in-memory preview, graph validation, and real-time collaboration. Zapier is linear; Supa AI is a graph.",
  },
  {
    question: "What's your refund policy?",
    answer:
      "If you're not happy within 14 days of upgrading, email support and we'll refund your subscription — no questions asked. Annual plans are refundable pro-rata for unused months.",
  },
  {
    question: "Do you support SSO?",
    answer:
      "SSO + SAML is available on Business and Enterprise plans. We support Google Workspace, Microsoft Entra, Okta, and any SAML 2.0 IdP. Enterprise also includes custom contracts + SLAs.",
  },
  {
    question: "Is my data used to train AI models?",
    answer:
      "Never. We don't train on customer data. Your prompts, completions, and uploaded files are stored in your Supabase project and never leave your tenant. Self-host for full air-gap control.",
  },
];

// ---------------------------------------------------------------------------
// Integrations list (used by the integrations page)
// ---------------------------------------------------------------------------

export interface IntegrationEntry {
  name: string;
  category: string;
  description: string;
  authType: "oauth2" | "api_key" | "basic" | "webhook" | "none";
  popular?: boolean;
}

export const INTEGRATIONS: readonly IntegrationEntry[] = [
  { name: "Slack", category: "Communication", description: "Send messages, create channels, manage users.", authType: "oauth2", popular: true },
  { name: "GitHub", category: "Developer", description: "Manage issues, PRs, repos, and CI workflows.", authType: "oauth2", popular: true },
  { name: "Stripe", category: "Payments", description: "Customers, invoices, subscriptions, webhooks.", authType: "api_key", popular: true },
  { name: "HubSpot", category: "CRM", description: "Contacts, deals, pipelines, lifecycle events.", authType: "oauth2", popular: true },
  { name: "Salesforce", category: "CRM", description: "Leads, opportunities, accounts, custom objects.", authType: "oauth2" },
  { name: "Notion", category: "Productivity", description: "Pages, databases, blocks, and properties.", authType: "oauth2" },
  { name: "Airtable", category: "Productivity", description: "Bases, tables, records, attachments.", authType: "api_key" },
  { name: "Linear", category: "Developer", description: "Issues, projects, cycles, teams.", authType: "oauth2" },
  { name: "Jira", category: "Developer", description: "Issues, sprints, boards, custom fields.", authType: "oauth2" },
  { name: "Asana", category: "Productivity", description: "Tasks, projects, sections, comments.", authType: "oauth2" },
  { name: "Trello", category: "Productivity", description: "Cards, lists, boards, labels.", authType: "api_key" },
  { name: "Discord", category: "Communication", description: "Send messages, manage roles, webhooks.", authType: "webhook" },
  { name: "Telegram", category: "Communication", description: "Send messages, manage chats, bots.", authType: "webhook" },
  { name: "WhatsApp", category: "Communication", description: "Send messages, templates, media.", authType: "api_key" },
  { name: "Shopify", category: "Ecommerce", description: "Orders, products, customers, inventory.", authType: "oauth2", popular: true },
  { name: "Webflow", category: "CMS", description: "Collections, items, sites, domains.", authType: "oauth2" },
  { name: "Vercel", category: "Developer", description: "Deployments, projects, env vars.", authType: "api_key" },
  { name: "Netlify", category: "Developer", description: "Sites, deploys, forms, functions.", authType: "api_key" },
  { name: "Supabase", category: "Developer", description: "Database, auth, storage, edge functions.", authType: "api_key" },
  { name: "S3", category: "Storage", description: "Buckets, objects, presigned URLs.", authType: "api_key" },
  { name: "Google Drive", category: "Storage", description: "Files, folders, sharing, permissions.", authType: "oauth2" },
  { name: "Google Sheets", category: "Productivity", description: "Sheets, ranges, formulas, formatting.", authType: "oauth2" },
  { name: "Google Calendar", category: "Productivity", description: "Events, reminders, attendees.", authType: "oauth2" },
  { name: "Zoom", category: "Communication", description: "Meetings, recordings, webinars.", authType: "oauth2" },
  { name: "Calendly", category: "Productivity", description: "Event types, bookings, schedules.", authType: "api_key" },
  { name: "Intercom", category: "Support", description: "Conversations, contacts, tickets.", authType: "oauth2" },
  { name: "Zendesk", category: "Support", description: "Tickets, users, organizations, macros.", authType: "api_key" },
  { name: "PagerDuty", category: "Operations", description: "Incidents, services, schedules.", authType: "api_key" },
  { name: "Datadog", category: "Monitoring", description: "Metrics, logs, traces, monitors.", authType: "api_key" },
  { name: "Segment", category: "Analytics", description: "Identify, track, page, group events.", authType: "api_key" },
  { name: "Mixpanel", category: "Analytics", description: "Events, funnels, retention.", authType: "api_key" },
  { name: "Amplitude", category: "Analytics", description: "Events, cohorts, user paths.", authType: "api_key" },
  { name: "Twilio", category: "Communication", description: "SMS, voice, verify, messaging.", authType: "api_key" },
  { name: "SendGrid", category: "Email", description: "Transactional + marketing email.", authType: "api_key" },
  { name: "Mailchimp", category: "Email", description: "Audiences, campaigns, automations.", authType: "api_key" },
  { name: "OpenAI Fine-Tune", category: "AI", description: "Fine-tune + manage custom models.", authType: "api_key" },
  { name: "Hugging Face", category: "AI", description: "Models, datasets, inference endpoints.", authType: "api_key" },
];

// ---------------------------------------------------------------------------
// Trust badges / pillars
// ---------------------------------------------------------------------------

export interface TrustPillar {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const TRUST_PILLARS: readonly TrustPillar[] = [
  {
    icon: ShieldCheck,
    title: "Secure by default",
    body: "Row-level security on every table, PKCE OAuth, AES-256-GCM field encryption, brute-force protection, and GDPR-ready data exports.",
  },
  {
    icon: Zap,
    title: "Built for production",
    body: "Streaming, tool calling, usage tracking, rate limiting, audit logs, and observability hooks out of the box.",
  },
  {
    icon: Lock,
    title: "Your data stays yours",
    body: "Self-host on Supabase. No third-party telemetry. We never train on your data. Delete your account anytime.",
  },
  {
    icon: Globe,
    title: "Truly multi-provider",
    body: "7 chat providers, 8 image providers, 7 voice providers, 8 video providers. Switch models mid-conversation.",
  },
];

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export const HERO_HEADLINE = "The enterprise AI platform that runs your business";
export const HERO_SUBHEADLINE =
  "Chat, image generation, voice, video, AI Employees, workflow builder, business tools, and a marketplace — all in one workspace. Built on Supabase. Self-hostable.";
export const HERO_PRIMARY_CTA = "Start free";
export const HERO_SECONDARY_CTA = "View products";
export const HERO_PRIMARY_HREF = "/?signup=1";
export const HERO_SECONDARY_HREF = "/?view=products";

/** Re-exported for callers that need the icon set. */
export {
  MessageSquare,
  ImageIcon,
  Mic,
  Video,
  Bot,
  Workflow,
  Store,
  Briefcase,
  Plug,
  ShieldCheck,
  Zap,
  Sparkles,
  Lock,
  Globe,
};
