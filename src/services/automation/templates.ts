/*
 * Workflow template system.
 * Provides built-in templates and template management.
 */

import type { TemplateCategory } from "./types";
import type { Json } from "@/types/generated/database";

// ─── Built-in Template Definitions ───────────────────────────────

const builtinTemplates: Array<{
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  triggers: Json[];
  actions: Json[];
  variables: Array<{ name: string; defaultValue?: unknown; scope: string; description: string }>;
  tags: string[];
}> = [
  {
    name: "Welcome User",
    description: "Automatically send a welcome notification when a new user joins the workspace. Helps with onboarding by delivering essential information and making new members feel acknowledged from the moment they arrive.",
    category: "onboarding",
    icon: "user-plus",
    triggers: [
      { name: "New Member", trigger_type: "event", event_name: "workspace.member_added", config: {} },
    ],
    actions: [
      { name: "Send Welcome", action_type: "send_notification", config: { title: "Welcome to the workspace!", message: "You have been added to this workspace. Explore the dashboard to get started." } },
    ],
    variables: [],
    tags: ["onboarding", "welcome"],
  },
  {
    name: "Lead Follow-Up",
    description: "Automatically create a follow-up task when a new lead is created in the CRM pipeline. This ensures no lead goes unattended and maintains a consistent sales process by immediately assigning actionable follow-up work to the responsible team member.",
    category: "crm",
    icon: "users",
    triggers: [
      { name: "Lead Created", trigger_type: "event", event_name: "lead.created", config: {} },
    ],
    actions: [
      { name: "Create Follow-Up Task", action_type: "create_task", config: { title: "Follow up with new lead", description: "A new lead was created. Reach out within 24 hours.", priority: "high" } },
      { name: "Notify Team", action_type: "send_notification", config: { title: "New Lead", message: "A new lead has been created and needs follow-up." } },
    ],
    variables: [],
    tags: ["crm", "leads", "sales"],
  },
  {
    name: "Invoice Reminder",
    description: "Send an automated notification when an invoice is created, keeping the finance team and relevant stakeholders informed about new billing events. Useful for maintaining awareness of outstanding invoices across the organization.",
    category: "billing",
    icon: "file-text",
    triggers: [
      { name: "Invoice Created", trigger_type: "event", event_name: "invoice.created", config: {} },
    ],
    actions: [
      { name: "Notify Finance", action_type: "send_notification", config: { title: "New Invoice", message: "A new invoice has been created." } },
    ],
    variables: [],
    tags: ["billing", "invoice", "finance"],
  },
  {
    name: "AI Document Summary",
    description: "When a document is uploaded or created, automatically generate an AI-powered summary and notify the workspace. Leverages the AI chat engine to produce concise, readable summaries of document content.",
    category: "ai_automation",
    icon: "sparkles",
    triggers: [
      { name: "File Uploaded", trigger_type: "event", event_name: "file.uploaded", config: {} },
    ],
    actions: [
      {
        name: "Generate Summary",
        action_type: "ai_chat",
        config: { prompt: "Summarize the following document content concisely:", systemPrompt: "You are a document summarization assistant. Provide a clear, concise summary." },
      },
    ],
    variables: [
      { name: "documentContent", scope: "local", description: "The content of the uploaded document" },
    ],
    tags: ["ai", "documents", "automation"],
  },
  {
    name: "Customer Onboarding",
    description: "Full customer onboarding workflow that creates a follow-up task and sends a welcome notification when a new customer is added to the system. Ensures every new customer receives prompt attention from the team.",
    category: "onboarding",
    icon: "user-check",
    triggers: [
      { name: "Customer Created", trigger_type: "event", event_name: "customer.created", config: {} },
    ],
    actions: [
      { name: "Create Onboarding Task", action_type: "create_task", config: { title: "Onboard new customer", description: "Complete the onboarding checklist for the new customer.", priority: "medium" } },
      { name: "Send Welcome", action_type: "send_notification", config: { title: "New Customer", message: "A new customer has been added. Start the onboarding process." } },
    ],
    variables: [],
    tags: ["onboarding", "customers"],
  },
  {
    name: "Project Setup",
    description: "Automate project initialization by creating a notification and initial task when a new project is created. Helps teams immediately begin organizing work around newly created projects.",
    category: "project_management",
    icon: "folder-plus",
    triggers: [
      { name: "Project Created", trigger_type: "event", event_name: "project.created", config: {} },
    ],
    actions: [
      { name: "Notify Team", action_type: "send_notification", config: { title: "New Project", message: "A new project has been created." } },
      { name: "Create Setup Task", action_type: "create_task", config: { title: "Project setup", description: "Configure the new project settings and assign team members.", priority: "high" } },
    ],
    variables: [],
    tags: ["project", "setup"],
  },
];

// ─── Template Functions ──────────────────────────────────────────

/**
 * Get all built-in templates.
 */
export function getBuiltinTemplates(): typeof builtinTemplates {
  return builtinTemplates;
}

/**
 * Get a built-in template by name.
 */
export function getBuiltinTemplate(name: string): (typeof builtinTemplates)[number] | undefined {
  return builtinTemplates.find((t) => t.name === name);
}

/**
 * Get templates grouped by category.
 */
export function getTemplatesByCategory(): Record<TemplateCategory, typeof builtinTemplates> {
  const grouped: Record<string, typeof builtinTemplates> = {
    onboarding: [],
    crm: [],
    billing: [],
    project_management: [],
    communication: [],
    data_processing: [],
    ai_automation: [],
    custom: [],
  };

  for (const template of builtinTemplates) {
    grouped[template.category].push(template);
  }

  return grouped as Record<TemplateCategory, typeof builtinTemplates>;
}
