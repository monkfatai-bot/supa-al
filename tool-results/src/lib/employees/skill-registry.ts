/**
 * Supa AI — Phase 9C Employee Skill Registry.
 *
 * The canonical catalog of skills an AI employee can be configured with.
 * Each skill is identified by a stable `name` (lowercase-kebab) and
 * carries a human-friendly `label`, `description`, a Lucide icon name
 * (so the client can render a consistent icon without bundling the
 * whole Lucide library here), and a `defaultConfig` skeleton that the
 * employee's per-instance `config` overrides.
 *
 * The registry is **client-safe** — it imports only types, never a
 * server-only module. Client components import it via
 * `@/lib/employees/client` (which re-exports this module).
 *
 * Adding a new skill:
 *   1. Append to {@link SKILL_DEFINITIONS}.
 *   2. Bump the catalog `version` if the public shape changes.
 *
 * @module @/lib/employees/skill-registry
 */
import type {
  AddSkillInput,
  EmployeeSkill,
} from "./types";

// ---------------------------------------------------------------------------
// Skill categories — used by the UI to group skills in the catalog.
// ---------------------------------------------------------------------------

/** Top-level skill categories. Stable string ids. */
export type SkillCategory =
  | "content"
  | "engineering"
  | "growth"
  | "research"
  | "media"
  | "operations"
  | "communication";

/** Human-readable label for a {@link SkillCategory}. */
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  content: "Content",
  engineering: "Engineering",
  growth: "Growth",
  research: "Research",
  media: "Media",
  operations: "Operations",
  communication: "Communication",
};

// ---------------------------------------------------------------------------
// Skill definition shape
// ---------------------------------------------------------------------------

/**
 * Catalog definition for a single skill. The `icon` field carries the
 * *name* of a Lucide icon (e.g. `"PenLine"`) — the client looks the
 * icon up via a small local map. Keeping the icon as a string (rather
 * than a `LucideIcon` instance) keeps this module client-safe without
 * pulling the Lucide bundle into every consumer.
 */
export interface SkillDefinition {
  /** Stable, lowercase-kebab identifier (e.g. `"content-writing"`). */
  name: string;
  /** Human-friendly label (e.g. `"Content Writing"`). */
  label: string;
  /** One-sentence description of what the skill enables. */
  description: string;
  /** Lucide icon name (resolved client-side). */
  icon: string;
  /** {@link SkillCategory} for grouping in the catalog UI. */
  category: SkillCategory;
  /**
   * Default `config` skeleton the skill is created with. Per-instance
   * overrides merge on top of this.
   */
  defaultConfig: Record<string, unknown>;
  /** Default proficiency (0..100) when the skill is added to an employee. */
  defaultProficiency: number;
}

// ---------------------------------------------------------------------------
// The canonical skill catalog — 15+ pre-defined skills.
// ---------------------------------------------------------------------------

/**
 * The immutable catalog of skills. The order is the catalog display
 * order — most-common skills first within each category.
 */
export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  {
    name: "content-writing",
    label: "Content Writing",
    description:
      "Drafts blog posts, articles, social copy, and long-form marketing content with brand voice.",
    icon: "PenLine",
    category: "content",
    defaultConfig: {
      tone: "professional",
      maxLength: 2000,
      formats: ["blog", "social", "email"],
    },
    defaultProficiency: 60,
  },
  {
    name: "coding",
    label: "Coding",
    description:
      "Writes, reviews, and refactors production code across multiple languages and frameworks.",
    icon: "Code2",
    category: "engineering",
    defaultConfig: {
      languages: ["typescript", "python"],
      reviewDepth: "standard",
      autoTest: true,
    },
    defaultProficiency: 55,
  },
  {
    name: "translation",
    label: "Translation",
    description:
      "Translates text between languages while preserving tone, register, and domain terminology.",
    icon: "Languages",
    category: "content",
    defaultConfig: {
      sourceLang: "auto",
      targetLangs: ["es", "fr", "de"],
      preserveFormatting: true,
    },
    defaultProficiency: 50,
  },
  {
    name: "seo",
    label: "SEO",
    description:
      "Optimizes content for search engines — keyword research, on-page SEO, meta tags, and structured data.",
    icon: "Search",
    category: "growth",
    defaultConfig: {
      keywordStrategy: "long-tail",
      includeMetaTags: true,
      internalLinking: true,
    },
    defaultProficiency: 50,
  },
  {
    name: "marketing",
    label: "Marketing",
    description:
      "Plans multi-channel campaigns, segments audiences, and optimizes funnel performance.",
    icon: "Megaphone",
    category: "growth",
    defaultConfig: {
      channels: ["email", "social", "paid"],
      cadence: "weekly",
      attributionModel: "last-touch",
    },
    defaultProficiency: 55,
  },
  {
    name: "sales",
    label: "Sales",
    description:
      "Qualifies leads, drafts outreach, and routes opportunities through the CRM pipeline.",
    icon: "TrendingUp",
    category: "growth",
    defaultConfig: {
      outreachStyle: "consultative",
      cadence: "3-touch",
      qualificationFramework: "bant",
    },
    defaultProficiency: 50,
  },
  {
    name: "research",
    label: "Research",
    description:
      "Conducts desk research, synthesizes sources, and produces structured reports with citations.",
    icon: "Microscope",
    category: "research",
    defaultConfig: {
      depth: "standard",
      citations: true,
      maxSources: 12,
    },
    defaultProficiency: 55,
  },
  {
    name: "image-generation",
    label: "Image Generation",
    description:
      "Generates images from text prompts using diffusion models — illustrations, photos, icons.",
    icon: "Image",
    category: "media",
    defaultConfig: {
      defaultStyle: "photorealistic",
      aspectRatio: "1:1",
      negativePrompts: [],
    },
    defaultProficiency: 45,
  },
  {
    name: "video-generation",
    label: "Video Generation",
    description:
      "Generates short video clips from text prompts — b-roll, explainers, social teasers.",
    icon: "Video",
    category: "media",
    defaultConfig: {
      defaultDuration: 8,
      fps: 30,
      resolution: "1080p",
    },
    defaultProficiency: 40,
  },
  {
    name: "voice-generation",
    label: "Voice Generation",
    description:
      "Synthesizes natural-sounding speech from text — narration, voice-overs, accessibility.",
    icon: "Mic",
    category: "media",
    defaultConfig: {
      defaultVoice: "neutral",
      speed: 1.0,
      stability: 0.5,
    },
    defaultProficiency: 45,
  },
  {
    name: "automation",
    label: "Automation",
    description:
      "Builds and triggers workflow automations — webhooks, schedules, conditional branching.",
    icon: "Workflow",
    category: "operations",
    defaultConfig: {
      maxSteps: 25,
      retryPolicy: "exponential",
      timeout: 60,
    },
    defaultProficiency: 50,
  },
  {
    name: "analytics",
    label: "Analytics",
    description:
      "Interprets product + business metrics, surfaces anomalies, and recommends actions.",
    icon: "BarChart3",
    category: "research",
    defaultConfig: {
      granularity: "daily",
      anomalyDetection: true,
      confidenceInterval: 0.95,
    },
    defaultProficiency: 55,
  },
  {
    name: "crm",
    label: "CRM",
    description:
      "Manages contacts, deals, and pipelines — creates, updates, and routes records in the CRM.",
    icon: "Users",
    category: "operations",
    defaultConfig: {
      defaultPipeline: "sales",
      deduplicate: true,
      enrichment: true,
    },
    defaultProficiency: 50,
  },
  {
    name: "email",
    label: "Email",
    description:
      "Drafts, schedules, and triages email — inbound classification, outbound outreach.",
    icon: "Mail",
    category: "communication",
    defaultConfig: {
      tone: "professional",
      maxDraftsPerDay: 50,
      autoTriage: true,
    },
    defaultProficiency: 55,
  },
  {
    name: "calendar",
    label: "Calendar",
    description:
      "Schedules meetings, resolves conflicts, and sends invitations across time zones.",
    icon: "CalendarClock",
    category: "operations",
    defaultConfig: {
      workingHours: "09:00-17:00",
      timezone: "auto",
      bufferMinutes: 15,
    },
    defaultProficiency: 50,
  },
  {
    name: "customer-support",
    label: "Customer Support",
    description:
      "Triage support tickets, draft responses, and escalate when SLA thresholds are at risk.",
    icon: "Headphones",
    category: "communication",
    defaultConfig: {
      slaMinutes: 60,
      tone: "empathetic",
      escalationThreshold: 0.4,
    },
    defaultProficiency: 55,
  },
  {
    name: "data-analysis",
    label: "Data Analysis",
    description:
      "Cleans, transforms, and visualizes datasets — surfaces trends and outliers.",
    icon: "Database",
    category: "research",
    defaultConfig: {
      maxRows: 100000,
      visualizationLibrary: "recharts",
      statisticalTests: true,
    },
    defaultProficiency: 50,
  },
];

/** Catalog version — bumped when the public shape changes. */
export const SKILL_CATALOG_VERSION = 1;

// ---------------------------------------------------------------------------
// Registry class — thin lookup API over the catalog
// ---------------------------------------------------------------------------

/**
 * Read-only lookup API over the skill catalog. The class is tiny on
 * purpose: it normalizes the surface (`list()`, `find()`,
 * `listByCategory()`) so the rest of the codebase never reaches into
 * the underlying array directly.
 */
export class SkillRegistry {
  private readonly byName: ReadonlyMap<string, SkillDefinition>;
  private readonly byCategory: ReadonlyMap<SkillCategory, SkillDefinition[]>;

  constructor(private readonly skills: readonly SkillDefinition[] = SKILL_DEFINITIONS) {
    const nameMap = new Map<string, SkillDefinition>();
    const catMap = new Map<SkillCategory, SkillDefinition[]>();
    for (const skill of skills) {
      nameMap.set(skill.name, skill);
      const arr = catMap.get(skill.category) ?? [];
      arr.push(skill);
      catMap.set(skill.category, arr);
    }
    this.byName = nameMap;
    this.byCategory = catMap;
  }

  /** All skills in display order. */
  list(): readonly SkillDefinition[] {
    return this.skills;
  }

  /** Find a skill by its name. Returns `undefined` when not found. */
  find(name: string): SkillDefinition | undefined {
    return this.byName.get(name);
  }

  /** All skills in a given category, in display order. */
  listByCategory(category: SkillCategory): readonly SkillDefinition[] {
    return this.byCategory.get(category) ?? [];
  }

  /** All categories that have at least one skill. */
  categories(): readonly SkillCategory[] {
    return Array.from(this.byCategory.keys()).sort();
  }

  /**
   * Resolve an {@link AddSkillInput} (from the API) into a full skill
   * definition with sane defaults. Returns `null` when the skill name
   * is unknown to the catalog.
   *
   * Used by the service layer when adding a skill to an employee.
   */
  resolve(input: AddSkillInput): {
    skillName: string;
    proficiency: number;
    isPrimary: boolean;
    config: Record<string, unknown>;
  } | null {
    const def = this.find(input.skillName);
    if (!def) return null;
    return {
      skillName: def.name,
      proficiency:
        typeof input.proficiency === "number"
          ? Math.max(0, Math.min(100, Math.round(input.proficiency)))
          : def.defaultProficiency,
      isPrimary: input.isPrimary ?? false,
      config: {
        ...def.defaultConfig,
        ...(input.config ?? {}),
      },
    };
  }

  /** Convert a skill row back into its catalog definition. */
  definitionForRow(row: EmployeeSkill): SkillDefinition | undefined {
    return this.find(row.skill_name);
  }
}

/** Singleton registry instance backed by {@link SKILL_DEFINITIONS}. */
export const skillRegistry = new SkillRegistry();
