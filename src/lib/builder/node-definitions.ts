/**
 * Supa AI — Phase 9B Builder — Node Definition Catalog.
 *
 * The canonical catalog of 71 node types the workflow builder can drop onto
 * the canvas. Organized by category:
 *
 *   - triggers       (4)   — workflow entry points
 *   - actions        (9)   — common workhorse operations
 *   - conditions     (3)   — branching logic
 *   - transforms     (4)   — data shape manipulation
 *   - ai             (5)   — LLM + generation calls
 *   - integrations   (38)  — third-party service adapters
 *   - outputs        (8)   — terminal sinks
 *
 * Total: 71.
 *
 * The registry is **client-safe** — it imports only types, never a
 * `server-only` module. Client components import it via
 * `@/lib/builder/client` (which re-exports this module).
 *
 * Adding a new node type:
 *   1. Append to {@link NODE_DEFINITIONS}.
 *   2. Bump the catalog `version` if the public shape changes.
 *
 * @module @/lib/builder/node-definitions
 */
import type { NodeDefinition, NodeType } from "./types";

// ---------------------------------------------------------------------------
// Category labels — used by the UI to group nodes in the palette.
// ---------------------------------------------------------------------------

/** Human-readable label for a {@link NodeType}. */
export const NODE_CATEGORY_LABELS: Record<NodeType, string> = {
  trigger: "Triggers",
  action: "Actions",
  condition: "Conditions",
  transform: "Transforms",
  ai: "AI",
  integration: "Integrations",
  output: "Outputs",
};

/** Display order for categories in the palette. */
export const NODE_CATEGORY_ORDER: readonly NodeType[] = [
  "trigger",
  "action",
  "condition",
  "transform",
  "ai",
  "integration",
  "output",
];

// ---------------------------------------------------------------------------
// Common config field fragments — reused across many nodes.
// ---------------------------------------------------------------------------

const urlField = (label: string, required = true) => ({
  key: "url",
  label,
  type: "url" as const,
  placeholder: "https://",
  required,
});

const methodField = () => ({
  key: "method",
  label: "HTTP Method",
  type: "select" as const,
  options: [
    { label: "GET", value: "GET" },
    { label: "POST", value: "POST" },
    { label: "PUT", value: "PUT" },
    { label: "PATCH", value: "PATCH" },
    { label: "DELETE", value: "DELETE" },
  ],
  defaultValue: "GET",
  required: true,
});

const headersField = () => ({
  key: "headers",
  label: "Headers (JSON)",
  type: "json" as const,
  placeholder: '{"Authorization":"Bearer …"}',
});

const bodyField = () => ({
  key: "body",
  label: "Body (JSON)",
  type: "json" as const,
});

// ---------------------------------------------------------------------------
// The canonical catalog — 71 nodes.
// ---------------------------------------------------------------------------

/**
 * The immutable catalog of node definitions. The order is the catalog
 * display order within each category — most-common nodes first.
 */
export const NODE_DEFINITIONS: readonly NodeDefinition[] = [
  // -----------------------------------------------------------------------
  // Triggers (4)
  // -----------------------------------------------------------------------
  {
    type: "schedule",
    label: "Schedule",
    description: "Fires on a cron schedule (e.g. every 5 minutes, daily at 9am).",
    icon: "Clock",
    category: "trigger",
    inputs: 0,
    outputs: 1,
    isStart: true,
    defaultConfig: { cron: "0 * * * *", timezone: "UTC" },
    configSchema: [
      { key: "cron", label: "Cron Expression", type: "text", placeholder: "0 * * * *", required: true, help: "Standard 5-field cron syntax." },
      { key: "timezone", label: "Timezone", type: "text", placeholder: "UTC", defaultValue: "UTC" },
    ],
  },
  {
    type: "webhook",
    label: "Webhook",
    description: "Fires when an external service POSTs to the workflow's unique webhook URL.",
    icon: "Webhook",
    category: "trigger",
    inputs: 0,
    outputs: 1,
    isStart: true,
    defaultConfig: { method: "POST", secret: "" },
    configSchema: [
      methodField(),
      { key: "secret", label: "Signing Secret", type: "text", help: "Optional HMAC-SHA256 secret to verify the request." },
    ],
  },
  {
    type: "event",
    label: "Event",
    description: "Fires when a platform event is emitted (e.g. document.created, user.signup).",
    icon: "Zap",
    category: "trigger",
    inputs: 0,
    outputs: 1,
    isStart: true,
    defaultConfig: { event: "", namespace: "platform" },
    configSchema: [
      { key: "event", label: "Event Name", type: "text", placeholder: "user.signup", required: true },
      { key: "namespace", label: "Namespace", type: "text", placeholder: "platform", defaultValue: "platform" },
    ],
  },
  {
    type: "manual",
    label: "Manual",
    description: "Fires when a user clicks Run in the builder (no automatic trigger).",
    icon: "Play",
    category: "trigger",
    inputs: 0,
    outputs: 1,
    isStart: true,
    defaultConfig: { input: {} },
    configSchema: [
      { key: "input", label: "Initial Variables (JSON)", type: "json" },
    ],
  },

  // -----------------------------------------------------------------------
  // Actions (9)
  // -----------------------------------------------------------------------
  {
    type: "send_email",
    label: "Send Email",
    description: "Sends an email via the configured SMTP / transactional provider.",
    icon: "Mail",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { to: "", subject: "", body: "", format: "text" },
    configSchema: [
      { key: "to", label: "To", type: "email", placeholder: "user@example.com", required: true },
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea", required: true },
      { key: "format", label: "Format", type: "select", options: [
        { label: "Plain text", value: "text" },
        { label: "HTML", value: "html" },
        { label: "Markdown", value: "markdown" },
      ], defaultValue: "text" },
    ],
  },
  {
    type: "http_request",
    label: "HTTP Request",
    description: "Performs an HTTP request and returns the parsed JSON / text response.",
    icon: "Globe",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { method: "GET", url: "", headers: {}, body: null, timeout: 30 },
    configSchema: [
      methodField(),
      urlField("URL"),
      headersField(),
      bodyField(),
      { key: "timeout", label: "Timeout (seconds)", type: "number", defaultValue: 30 },
    ],
  },
  {
    type: "create_record",
    label: "Create Record",
    description: "Inserts a row into the specified workspace table / external record set.",
    icon: "Plus",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { table: "", data: {} },
    configSchema: [
      { key: "table", label: "Table", type: "text", placeholder: "contacts", required: true },
      { key: "data", label: "Data (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "update_record",
    label: "Update Record",
    description: "Updates rows in a table matching a filter.",
    icon: "Pencil",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { table: "", id: "", data: {} },
    configSchema: [
      { key: "table", label: "Table", type: "text", required: true },
      { key: "id", label: "Record ID", type: "text", required: true },
      { key: "data", label: "Patch (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "delete_record",
    label: "Delete Record",
    description: "Deletes a row by id from the specified table.",
    icon: "Trash2",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { table: "", id: "" },
    configSchema: [
      { key: "table", label: "Table", type: "text", required: true },
      { key: "id", label: "Record ID", type: "text", required: true },
    ],
  },
  {
    type: "send_notification",
    label: "Send Notification",
    description: "Pushes an in-app notification to a user or channel.",
    icon: "Bell",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { recipient: "", title: "", body: "" },
    configSchema: [
      { key: "recipient", label: "Recipient (user id or @channel)", type: "text", required: true },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea" },
    ],
  },
  {
    type: "delay",
    label: "Delay",
    description: "Pauses the workflow for a fixed duration before continuing.",
    icon: "Timer",
    category: "action",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { duration: 60, unit: "seconds" },
    configSchema: [
      { key: "duration", label: "Duration", type: "number", defaultValue: 60, required: true },
      { key: "unit", label: "Unit", type: "select", options: [
        { label: "Seconds", value: "seconds" },
        { label: "Minutes", value: "minutes" },
        { label: "Hours", value: "hours" },
        { label: "Days", value: "days" },
      ], defaultValue: "seconds" },
    ],
  },
  {
    type: "parallel",
    label: "Parallel",
    description: "Fans out to N branches concurrently and waits for all to complete.",
    icon: "GitFork",
    category: "action",
    inputs: 1,
    outputs: 4,
    isStart: false,
    defaultConfig: { branches: 2, wait_for_all: true },
    configSchema: [
      { key: "branches", label: "Branches", type: "number", defaultValue: 2, required: true },
      { key: "wait_for_all", label: "Wait for all branches", type: "boolean", defaultValue: true },
    ],
  },
  {
    type: "merge",
    label: "Merge",
    description: "Joins N parallel branches back into a single output stream.",
    icon: "GitMerge",
    category: "action",
    inputs: 4,
    outputs: 1,
    isStart: false,
    defaultConfig: { strategy: "wait_all" },
    configSchema: [
      { key: "strategy", label: "Strategy", type: "select", options: [
        { label: "Wait for all", value: "wait_all" },
        { label: "First to finish", value: "first" },
        { label: "Last to finish", value: "last" },
      ], defaultValue: "wait_all" },
    ],
  },

  // -----------------------------------------------------------------------
  // Conditions (3)
  // -----------------------------------------------------------------------
  {
    type: "if",
    label: "If",
    description: "Routes to the truthy branch when the condition is met, otherwise the falsy branch.",
    icon: "GitBranch",
    category: "condition",
    inputs: 1,
    outputs: 2,
    isStart: false,
    defaultConfig: { expression: "value == true" },
    configSchema: [
      { key: "expression", label: "Expression", type: "text", placeholder: "value == true", required: true, help: "A simple JS-like comparison expression evaluated against the current variables." },
    ],
  },
  {
    type: "switch",
    label: "Switch",
    description: "Routes to one of N branches based on a value lookup.",
    icon: "Shuffle",
    category: "condition",
    inputs: 1,
    outputs: 4,
    isStart: false,
    defaultConfig: { key: "status", cases: {} },
    configSchema: [
      { key: "key", label: "Variable Key", type: "text", placeholder: "status", required: true },
      { key: "cases", label: "Cases (JSON)", type: "json", placeholder: '{"ok":1,"error":2}' },
    ],
  },
  {
    type: "filter",
    label: "Filter",
    description: "Passes the payload through when the predicate matches; otherwise drops it.",
    icon: "Filter",
    category: "condition",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { expression: "value != null" },
    configSchema: [
      { key: "expression", label: "Predicate", type: "text", placeholder: "value != null", required: true },
    ],
  },

  // -----------------------------------------------------------------------
  // Transforms (4)
  // -----------------------------------------------------------------------
  {
    type: "map",
    label: "Map",
    description: "Applies a per-item transform to every entry in an array payload.",
    icon: "List",
    category: "transform",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { field: "items", template: "{{item}}" },
    configSchema: [
      { key: "field", label: "Input Field", type: "text", placeholder: "items", required: true },
      { key: "template", label: "Template (per item)", type: "textarea", placeholder: "{{item}}" },
    ],
  },
  {
    type: "reduce",
    label: "Reduce",
    description: "Aggregates an array into a single value using an accumulator expression.",
    icon: "Sigma",
    category: "transform",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { field: "items", initial: "0", expression: "acc + item" },
    configSchema: [
      { key: "field", label: "Input Field", type: "text", required: true },
      { key: "initial", label: "Initial Value", type: "text", defaultValue: "0" },
      { key: "expression", label: "Expression", type: "text", placeholder: "acc + item", required: true },
    ],
  },
  {
    type: "format",
    label: "Format",
    description: "Formats a value using a template string with variable interpolation.",
    icon: "Type",
    category: "transform",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { template: "Hello {{name}}!" },
    configSchema: [
      { key: "template", label: "Template", type: "textarea", placeholder: "Hello {{name}}!", required: true },
    ],
  },
  {
    type: "parse",
    label: "Parse",
    description: "Parses a string value as JSON, CSV, or XML into a structured value.",
    icon: "Braces",
    category: "transform",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { format: "json", field: "body" },
    configSchema: [
      { key: "format", label: "Format", type: "select", options: [
        { label: "JSON", value: "json" },
        { label: "CSV", value: "csv" },
        { label: "XML", value: "xml" },
        { label: "YAML", value: "yaml" },
      ], defaultValue: "json" },
      { key: "field", label: "Input Field", type: "text", defaultValue: "body" },
    ],
  },

  // -----------------------------------------------------------------------
  // AI (5)
  // -----------------------------------------------------------------------
  {
    type: "ai_chat",
    label: "AI Chat",
    description: "Calls the configured chat model with a prompt and returns the response text.",
    icon: "MessageSquare",
    category: "ai",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { model: "auto", system: "", prompt: "{{input}}", temperature: 0.7 },
    configSchema: [
      { key: "model", label: "Model", type: "text", placeholder: "auto", defaultValue: "auto" },
      { key: "system", label: "System Prompt", type: "textarea" },
      { key: "prompt", label: "User Prompt", type: "textarea", required: true },
      { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.7 },
    ],
  },
  {
    type: "generate_image",
    label: "Generate Image",
    description: "Generates an image from a text prompt using the configured image provider.",
    icon: "Image",
    category: "ai",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { provider: "auto", model: "auto", prompt: "", size: "1024x1024" },
    configSchema: [
      { key: "provider", label: "Provider", type: "text", defaultValue: "auto" },
      { key: "model", label: "Model", type: "text", defaultValue: "auto" },
      { key: "prompt", label: "Prompt", type: "textarea", required: true },
      { key: "size", label: "Size", type: "select", options: [
        { label: "1024x1024 (square)", value: "1024x1024" },
        { label: "1792x1024 (landscape)", value: "1792x1024" },
        { label: "1024x1792 (portrait)", value: "1024x1792" },
      ], defaultValue: "1024x1024" },
    ],
  },
  {
    type: "transcribe",
    label: "Transcribe Audio",
    description: "Transcribes an audio file URL into text using a speech-to-text provider.",
    icon: "AudioLines",
    category: "ai",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { provider: "auto", audio_url: "", language: "auto" },
    configSchema: [
      { key: "provider", label: "Provider", type: "text", defaultValue: "auto" },
      { key: "audio_url", label: "Audio URL", type: "url", required: true },
      { key: "language", label: "Language", type: "text", defaultValue: "auto" },
    ],
  },
  {
    type: "analyze",
    label: "Analyze Data",
    description: "Runs a structured analysis (summary, sentiment, classification) over a payload.",
    icon: "Microscope",
    category: "ai",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { mode: "summary", field: "input" },
    configSchema: [
      { key: "mode", label: "Mode", type: "select", options: [
        { label: "Summary", value: "summary" },
        { label: "Sentiment", value: "sentiment" },
        { label: "Classify", value: "classify" },
        { label: "Extract", value: "extract" },
      ], defaultValue: "summary" },
      { key: "field", label: "Input Field", type: "text", defaultValue: "input" },
    ],
  },
  {
    type: "ai_embed",
    label: "Generate Embedding",
    description: "Generates a vector embedding for the input text (used by similarity nodes).",
    icon: "Vector",
    category: "ai",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { model: "auto", text: "{{input}}" },
    configSchema: [
      { key: "model", label: "Model", type: "text", defaultValue: "auto" },
      { key: "text", label: "Text", type: "textarea", required: true },
    ],
  },

  // -----------------------------------------------------------------------
  // Integrations (38) — third-party services
  // -----------------------------------------------------------------------
  {
    type: "slack",
    label: "Slack",
    description: "Posts a message to a Slack channel via the Slack Web API.",
    icon: "MessageCircle",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { channel: "", message: "" },
    configSchema: [
      { key: "channel", label: "Channel", type: "text", placeholder: "#general", required: true },
      { key: "message", label: "Message", type: "textarea", required: true },
    ],
  },
  {
    type: "github",
    label: "GitHub",
    description: "Performs a GitHub API call (create issue, comment, dispatch workflow, etc.).",
    icon: "Github",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "create_issue", repo: "", title: "", body: "" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Create issue", value: "create_issue" },
        { label: "Add comment", value: "add_comment" },
        { label: "Dispatch workflow", value: "dispatch_workflow" },
        { label: "Create PR", value: "create_pr" },
      ], defaultValue: "create_issue" },
      { key: "repo", label: "Repo (owner/name)", type: "text", placeholder: "octocat/Hello-World", required: true },
      { key: "title", label: "Title", type: "text" },
      { key: "body", label: "Body", type: "textarea" },
    ],
  },
  {
    type: "stripe",
    label: "Stripe",
    description: "Creates a Stripe Checkout Session, Customer, or invoice.",
    icon: "CreditCard",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "create_checkout", amount: 0, currency: "usd" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Create checkout session", value: "create_checkout" },
        { label: "Create customer", value: "create_customer" },
        { label: "Create invoice", value: "create_invoice" },
      ], defaultValue: "create_checkout" },
      { key: "amount", label: "Amount (cents)", type: "number", defaultValue: 0 },
      { key: "currency", label: "Currency", type: "text", defaultValue: "usd" },
    ],
  },
  {
    type: "twilio",
    label: "Twilio",
    description: "Sends an SMS via Twilio.",
    icon: "Phone",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { to: "", from: "", body: "" },
    configSchema: [
      { key: "to", label: "To", type: "text", placeholder: "+15551234567", required: true },
      { key: "from", label: "From", type: "text", required: true },
      { key: "body", label: "Message", type: "textarea", required: true },
    ],
  },
  {
    type: "sendgrid",
    label: "SendGrid",
    description: "Sends a transactional email via SendGrid.",
    icon: "Send",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { to: "", from: "", subject: "", template_id: "" },
    configSchema: [
      { key: "to", label: "To", type: "email", required: true },
      { key: "from", label: "From", type: "email", required: true },
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "template_id", label: "Template ID", type: "text" },
    ],
  },
  {
    type: "mailchimp",
    label: "Mailchimp",
    description: "Adds a contact to a Mailchimp audience list.",
    icon: "Mailbox",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { audience_id: "", email: "" },
    configSchema: [
      { key: "audience_id", label: "Audience ID", type: "text", required: true },
      { key: "email", label: "Subscriber Email", type: "email", required: true },
    ],
  },
  {
    type: "hubspot",
    label: "HubSpot",
    description: "Creates or updates a HubSpot contact.",
    icon: "Contact",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "upsert_contact", email: "", properties: {} },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Upsert contact", value: "upsert_contact" },
        { label: "Create deal", value: "create_deal" },
        { label: "Log activity", value: "log_activity" },
      ], defaultValue: "upsert_contact" },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "properties", label: "Properties (JSON)", type: "json" },
    ],
  },
  {
    type: "salesforce",
    label: "Salesforce",
    description: "Creates or updates a Salesforce Lead / Contact / Opportunity.",
    icon: "Cloud",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { object: "Lead", action: "create", data: {} },
    configSchema: [
      { key: "object", label: "Object", type: "select", options: [
        { label: "Lead", value: "Lead" },
        { label: "Contact", value: "Contact" },
        { label: "Opportunity", value: "Opportunity" },
        { label: "Account", value: "Account" },
      ], defaultValue: "Lead" },
      { key: "action", label: "Action", type: "select", options: [
        { label: "Create", value: "create" },
        { label: "Update", value: "update" },
      ], defaultValue: "create" },
      { key: "data", label: "Data (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "notion",
    label: "Notion",
    description: "Creates a page or updates a database row in Notion.",
    icon: "FileText",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { database_id: "", title: "", properties: {} },
    configSchema: [
      { key: "database_id", label: "Database ID", type: "text", required: true },
      { key: "title", label: "Title", type: "text" },
      { key: "properties", label: "Properties (JSON)", type: "json" },
    ],
  },
  {
    type: "airtable",
    label: "Airtable",
    description: "Creates a record in an Airtable base + table.",
    icon: "Table",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { base_id: "", table: "", fields: {} },
    configSchema: [
      { key: "base_id", label: "Base ID", type: "text", required: true },
      { key: "table", label: "Table", type: "text", required: true },
      { key: "fields", label: "Fields (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "linear",
    label: "Linear",
    description: "Creates an issue or comment in Linear.",
    icon: "ChartLine",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { team: "", title: "", description: "", priority: 2 },
    configSchema: [
      { key: "team", label: "Team ID", type: "text", required: true },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "priority", label: "Priority (0-4)", type: "number", defaultValue: 2 },
    ],
  },
  {
    type: "jira",
    label: "Jira",
    description: "Creates an issue in a Jira project.",
    icon: "Square",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { project: "", summary: "", issue_type: "Task" },
    configSchema: [
      { key: "project", label: "Project Key", type: "text", required: true },
      { key: "summary", label: "Summary", type: "text", required: true },
      { key: "issue_type", label: "Issue Type", type: "text", defaultValue: "Task" },
    ],
  },
  {
    type: "asana",
    label: "Asana",
    description: "Creates a task in an Asana project.",
    icon: "CheckSquare",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { project: "", name: "", notes: "" },
    configSchema: [
      { key: "project", label: "Project ID", type: "text", required: true },
      { key: "name", label: "Task Name", type: "text", required: true },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    type: "trello",
    label: "Trello",
    description: "Creates a card on a Trello list.",
    icon: "KanbanSquare",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { list_id: "", name: "", description: "" },
    configSchema: [
      { key: "list_id", label: "List ID", type: "text", required: true },
      { key: "name", label: "Card Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    type: "discord",
    label: "Discord",
    description: "Posts a message to a Discord channel via webhook.",
    icon: "MessagesSquare",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { webhook_url: "", content: "" },
    configSchema: [
      { key: "webhook_url", label: "Webhook URL", type: "url", required: true },
      { key: "content", label: "Message", type: "textarea", required: true },
    ],
  },
  {
    type: "telegram",
    label: "Telegram",
    description: "Sends a message via a Telegram bot.",
    icon: "Send",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { chat_id: "", text: "" },
    configSchema: [
      { key: "chat_id", label: "Chat ID", type: "text", required: true },
      { key: "text", label: "Message", type: "textarea", required: true },
    ],
  },
  {
    type: "whatsapp",
    label: "WhatsApp",
    description: "Sends a WhatsApp template message via the WhatsApp Business API.",
    icon: "MessageSquareMore",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { to: "", template: "", language: "en" },
    configSchema: [
      { key: "to", label: "To", type: "text", required: true },
      { key: "template", label: "Template Name", type: "text", required: true },
      { key: "language", label: "Language", type: "text", defaultValue: "en" },
    ],
  },
  {
    type: "shopify",
    label: "Shopify",
    description: "Creates an order / customer / product in a Shopify store.",
    icon: "ShoppingBag",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "create_order", data: {} },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Create order", value: "create_order" },
        { label: "Create customer", value: "create_customer" },
        { label: "Create product", value: "create_product" },
      ], defaultValue: "create_order" },
      { key: "data", label: "Data (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "webflow",
    label: "Webflow",
    description: "Creates or updates a CMS item in a Webflow collection.",
    icon: "Globe",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { collection_id: "", fields: {} },
    configSchema: [
      { key: "collection_id", label: "Collection ID", type: "text", required: true },
      { key: "fields", label: "Fields (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "vercel",
    label: "Vercel",
    description: "Triggers a Vercel deployment or fetches deployment status.",
    icon: "Triangle",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "deploy", project: "" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Deploy", value: "deploy" },
        { label: "Get status", value: "status" },
        { label: "Cancel", value: "cancel" },
      ], defaultValue: "deploy" },
      { key: "project", label: "Project ID", type: "text", required: true },
    ],
  },
  {
    type: "netlify",
    label: "Netlify",
    description: "Triggers a Netlify site build.",
    icon: "Boxes",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { site_id: "" },
    configSchema: [
      { key: "site_id", label: "Site ID", type: "text", required: true },
    ],
  },
  {
    type: "supabase",
    label: "Supabase",
    description: "Performs a Supabase query against a project's Postgrest endpoint.",
    icon: "Database",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { project: "", table: "", operation: "select", filter: "" },
    configSchema: [
      { key: "project", label: "Project Ref", type: "text", required: true },
      { key: "table", label: "Table", type: "text", required: true },
      { key: "operation", label: "Operation", type: "select", options: [
        { label: "Select", value: "select" },
        { label: "Insert", value: "insert" },
        { label: "Update", value: "update" },
        { label: "Delete", value: "delete" },
      ], defaultValue: "select" },
      { key: "filter", label: "Filter (Postgrest syntax)", type: "text" },
    ],
  },
  {
    type: "s3",
    label: "S3 / R2",
    description: "Uploads an object to an S3-compatible bucket (S3, R2, MinIO).",
    icon: "HardDrive",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { bucket: "", key: "", content: "" },
    configSchema: [
      { key: "bucket", label: "Bucket", type: "text", required: true },
      { key: "key", label: "Object Key", type: "text", required: true },
      { key: "content", label: "Content", type: "textarea" },
    ],
  },
  {
    type: "gdrive",
    label: "Google Drive",
    description: "Uploads a file or creates a folder in Google Drive.",
    icon: "FolderOpen",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "upload", parent: "", name: "", content: "" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Upload file", value: "upload" },
        { label: "Create folder", value: "create_folder" },
      ], defaultValue: "upload" },
      { key: "parent", label: "Parent Folder ID", type: "text" },
      { key: "name", label: "File / Folder Name", type: "text", required: true },
      { key: "content", label: "Content", type: "textarea" },
    ],
  },
  {
    type: "gsheets",
    label: "Google Sheets",
    description: "Appends a row or updates a cell in a Google Sheet.",
    icon: "Sheet",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { spreadsheet_id: "", range: "A1", values: [] },
    configSchema: [
      { key: "spreadsheet_id", label: "Spreadsheet ID", type: "text", required: true },
      { key: "range", label: "Range", type: "text", placeholder: "Sheet1!A1:D1", required: true },
      { key: "values", label: "Values (JSON array)", type: "json", required: true },
    ],
  },
  {
    type: "calendar",
    label: "Google Calendar",
    description: "Creates a calendar event.",
    icon: "Calendar",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { calendar_id: "primary", summary: "", start: "", end: "" },
    configSchema: [
      { key: "calendar_id", label: "Calendar ID", type: "text", defaultValue: "primary" },
      { key: "summary", label: "Summary", type: "text", required: true },
      { key: "start", label: "Start (ISO)", type: "text", required: true },
      { key: "end", label: "End (ISO)", type: "text", required: true },
    ],
  },
  {
    type: "zoom",
    label: "Zoom",
    description: "Creates a Zoom meeting.",
    icon: "Video",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { topic: "", start: "", duration: 30 },
    configSchema: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "start", label: "Start (ISO)", type: "text", required: true },
      { key: "duration", label: "Duration (minutes)", type: "number", defaultValue: 30 },
    ],
  },
  {
    type: "calendly",
    label: "Calendly",
    description: "Fetches upcoming Calendly events for the configured user.",
    icon: "CalendarClock",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { user: "", count: 10 },
    configSchema: [
      { key: "user", label: "User URI", type: "text", required: true },
      { key: "count", label: "Count", type: "number", defaultValue: 10 },
    ],
  },
  {
    type: "intercom",
    label: "Intercom",
    description: "Creates or updates an Intercom contact / conversation.",
    icon: "Headphones",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "create_contact", email: "", name: "" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Create contact", value: "create_contact" },
        { label: "Create conversation", value: "create_conversation" },
      ], defaultValue: "create_contact" },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "name", label: "Name", type: "text" },
    ],
  },
  {
    type: "zendesk",
    label: "Zendesk",
    description: "Creates a Zendesk ticket on behalf of a requester.",
    icon: "Ticket",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { subject: "", body: "", requester_email: "" },
    configSchema: [
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea", required: true },
      { key: "requester_email", label: "Requester Email", type: "email", required: true },
    ],
  },
  {
    type: "pagerduty",
    label: "PagerDuty",
    description: "Triggers a PagerDuty incident.",
    icon: "Siren",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { service_id: "", title: "", urgency: "high" },
    configSchema: [
      { key: "service_id", label: "Service ID", type: "text", required: true },
      { key: "title", label: "Incident Title", type: "text", required: true },
      { key: "urgency", label: "Urgency", type: "select", options: [
        { label: "High", value: "high" },
        { label: "Low", value: "low" },
      ], defaultValue: "high" },
    ],
  },
  {
    type: "datadog",
    label: "Datadog",
    description: "Submits a metric or event to Datadog.",
    icon: "Activity",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "event", title: "", text: "" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Submit event", value: "event" },
        { label: "Submit metric", value: "metric" },
      ], defaultValue: "event" },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "text", label: "Text", type: "textarea", required: true },
    ],
  },
  {
    type: "segment",
    label: "Segment",
    description: "Tracks an event or identifies a user via Segment.",
    icon: "PieChart",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { action: "track", event: "", user_id: "" },
    configSchema: [
      { key: "action", label: "Action", type: "select", options: [
        { label: "Track", value: "track" },
        { label: "Identify", value: "identify" },
        { label: "Page", value: "page" },
      ], defaultValue: "track" },
      { key: "event", label: "Event Name", type: "text", required: true },
      { key: "user_id", label: "User ID", type: "text", required: true },
    ],
  },
  {
    type: "mixpanel",
    label: "Mixpanel",
    description: "Tracks an event in Mixpanel.",
    icon: "BarChart3",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { event: "", distinct_id: "", properties: {} },
    configSchema: [
      { key: "event", label: "Event Name", type: "text", required: true },
      { key: "distinct_id", label: "Distinct ID", type: "text", required: true },
      { key: "properties", label: "Properties (JSON)", type: "json" },
    ],
  },
  {
    type: "amplitude",
    label: "Amplitude",
    description: "Logs an event in Amplitude.",
    icon: "LineChart",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { event: "", user_id: "", properties: {} },
    configSchema: [
      { key: "event", label: "Event Name", type: "text", required: true },
      { key: "user_id", label: "User ID", type: "text", required: true },
      { key: "properties", label: "Properties (JSON)", type: "json" },
    ],
  },
  {
    type: "twilio_voice",
    label: "Twilio Voice",
    description: "Initiates an outbound voice call via Twilio.",
    icon: "PhoneCall",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { to: "", from: "", url: "" },
    configSchema: [
      { key: "to", label: "To", type: "text", required: true },
      { key: "from", label: "From", type: "text", required: true },
      { key: "url", label: "Twiml URL", type: "url", required: true },
    ],
  },
  {
    type: "openai_fine_tune",
    label: "OpenAI Fine-tune",
    description: "Submits a fine-tuning job to OpenAI.",
    icon: "BrainCircuit",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { model: "gpt-4o", training_file: "" },
    configSchema: [
      { key: "model", label: "Base Model", type: "text", required: true },
      { key: "training_file", label: "Training File ID", type: "text", required: true },
    ],
  },
  {
    type: "huggingface",
    label: "Hugging Face",
    description: "Calls a Hugging Face inference endpoint.",
    icon: "FaceSmile",
    category: "integration",
    inputs: 1,
    outputs: 1,
    isStart: false,
    defaultConfig: { model: "", inputs: "" },
    configSchema: [
      { key: "model", label: "Model", type: "text", required: true },
      { key: "inputs", label: "Inputs", type: "textarea", required: true },
    ],
  },

  // -----------------------------------------------------------------------
  // Outputs (8) — terminal sinks
  // -----------------------------------------------------------------------
  {
    type: "webhook_response",
    label: "Webhook Response",
    description: "Returns a JSON body + status code to the caller of the workflow's webhook trigger.",
    icon: "Reply",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { status: 200, body: {} },
    configSchema: [
      { key: "status", label: "HTTP Status", type: "number", defaultValue: 200, required: true },
      { key: "body", label: "Body (JSON)", type: "json" },
    ],
  },
  {
    type: "file_output",
    label: "File Output",
    description: "Writes a file to the workspace's file library.",
    icon: "FileOutput",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { filename: "output.txt", content: "" },
    configSchema: [
      { key: "filename", label: "Filename", type: "text", required: true },
      { key: "content", label: "Content", type: "textarea", required: true },
    ],
  },
  {
    type: "database_write",
    label: "Database Write",
    description: "Commits the in-flight variables to a workspace database table (audit sink).",
    icon: "DatabaseZap",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { table: "workflow_runs", data: {} },
    configSchema: [
      { key: "table", label: "Table", type: "text", required: true },
      { key: "data", label: "Data (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "log_output",
    label: "Log",
    description: "Writes a log line to the workflow's run log. Useful for debugging.",
    icon: "Terminal",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { level: "info", message: "" },
    configSchema: [
      { key: "level", label: "Level", type: "select", options: [
        { label: "Debug", value: "debug" },
        { label: "Info", value: "info" },
        { label: "Warn", value: "warn" },
        { label: "Error", value: "error" },
      ], defaultValue: "info" },
      { key: "message", label: "Message", type: "textarea", required: true },
    ],
  },
  {
    type: "send_to_topic",
    label: "Pub/Sub Topic",
    description: "Publishes the payload to a topic for other workflows to consume.",
    icon: "Share2",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { topic: "" },
    configSchema: [
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
  },
  {
    type: "queue_task",
    label: "Queue Task",
    description: "Enqueues a background task for the platform's job runner.",
    icon: "ListTodo",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { queue: "default", payload: {} },
    configSchema: [
      { key: "queue", label: "Queue Name", type: "text", defaultValue: "default" },
      { key: "payload", label: "Payload (JSON)", type: "json" },
    ],
  },
  {
    type: "sse_response",
    label: "SSE Response",
    description: "Streams Server-Sent Events back to the webhook caller (long-running responses).",
    icon: "Radio",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { events: [] },
    configSchema: [
      { key: "events", label: "Events (JSON array)", type: "json" },
    ],
  },
  {
    type: "end",
    label: "End",
    description: "Terminates the workflow run with the given status.",
    icon: "Square",
    category: "output",
    inputs: 1,
    outputs: 0,
    isStart: false,
    defaultConfig: { status: "success" },
    configSchema: [
      { key: "status", label: "Status", type: "select", options: [
        { label: "Success", value: "success" },
        { label: "Failure", value: "failure" },
        { label: "Cancelled", value: "cancelled" },
      ], defaultValue: "success" },
    ],
  },
];

/** Catalog version — bumped when the public shape changes. */
export const NODE_CATALOG_VERSION = 1;

// ---------------------------------------------------------------------------
// Registry class — thin lookup API over the catalog
// ---------------------------------------------------------------------------

/**
 * Read-only lookup API over the node catalog. The class is tiny on
 * purpose: it normalizes the surface (`list()`, `find()`,
 * `listByCategory()`, `listStartNodes()`) so the rest of the codebase
 * never reaches into the underlying array directly.
 */
export class NodeRegistry {
  private readonly byType: ReadonlyMap<string, NodeDefinition>;
  private readonly byCategory: ReadonlyMap<NodeType, NodeDefinition[]>;

  constructor(private readonly nodes: readonly NodeDefinition[] = NODE_DEFINITIONS) {
    const typeMap = new Map<string, NodeDefinition>();
    const catMap = new Map<NodeType, NodeDefinition[]>();
    for (const node of nodes) {
      typeMap.set(node.type, node);
      const arr = catMap.get(node.category) ?? [];
      arr.push(node);
      catMap.set(node.category, arr);
    }
    this.byType = typeMap;
    this.byCategory = catMap;
  }

  /** All nodes in display order. */
  list(): readonly NodeDefinition[] {
    return this.nodes;
  }

  /** Find a node by its type. Returns `undefined` when not found. */
  find(type: string): NodeDefinition | undefined {
    return this.byType.get(type);
  }

  /** All nodes in a given category, in display order. */
  listByCategory(category: NodeType): readonly NodeDefinition[] {
    return this.byCategory.get(category) ?? [];
  }

  /** All start-capable nodes (triggers, manual). */
  listStartNodes(): readonly NodeDefinition[] {
    return this.nodes.filter((n) => n.isStart);
  }

  /** All categories that have at least one node. */
  categories(): readonly NodeType[] {
    return Array.from(this.byCategory.keys()).sort();
  }

  /** Total number of nodes in the catalog. */
  size(): number {
    return this.nodes.length;
  }
}

/** Singleton registry instance backed by {@link NODE_DEFINITIONS}. */
export const nodeRegistry = new NodeRegistry();
