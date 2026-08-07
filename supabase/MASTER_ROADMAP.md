# Master Roadmap

> **Purpose.** This document tracks the six-phase development plan for Supa AI, from the current Phase 1 foundation to the Phase 6 enterprise scale-out. Each phase lists goals, key modules, dependencies on prior phases, and rough scope. Status markers: ✅ done · 🚧 in progress · 📋 planned.

For the per-task checklist, see [`TASKS.md`](TASKS.md). For the technical reference, see [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md).

---

## At-a-glance

| Phase | Theme | Status | Target |
|---|---|---|---|
| **Phase 1** | Foundation | 🚧 in progress | A bootable, type-safe, env-validated platform with all `src/lib/*` modules and a dashboard shell. |
| **Phase 2** | AI Chat | 📋 planned | Full ChatGPT-class chat UX with streaming, history, model picker, prompt library. |
| **Phase 3** | Image Generation | 📋 planned | Text-to-image pipeline, gallery, asset management, provider routing. |
| **Phase 4** | Business Tools | 📋 planned | Document AI, email drafter, meeting summarizer, spreadsheet assistant. |
| **Phase 5** | Marketplace | 📋 planned | Creator onboarding, listings, payouts, revenue share. |
| **Phase 6** | Scaling & Enterprise | 📋 planned | SSO/SAML, audit logs, multi-region, on-prem AI gateway. |

---

## Phase 1 — Foundation 🚧

**Goal.** Ship a production-grade foundation that every later phase builds on: env validation, error hierarchy, structured logger, Supabase integration, AI provider abstraction, billing provider abstraction, rate limiting, feature flags, security/crypto, storage, validation, dashboard shell, theme system, full documentation.

**Dependencies:** none (this is the start).

### Phase 1 deliverables

| # | Deliverable | Status | Notes |
|---|---|---|---|
| 1 | Remove Prisma + SQLite | ✅ | Per Task 1 — `prisma/` and `src/lib/db.ts` deleted. |
| 2 | Install Supabase stack (`@supabase/supabase-js`, `@supabase/ssr`) | ✅ | Per Task 1. |
| 3 | Install AI SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) | ✅ | Per Task 1. |
| 4 | Install billing (`stripe`, `@stripe/stripe-js`) | ✅ | Per Task 1. |
| 5 | Install `ioredis` | ✅ | Per Task 1. |
| 6 | Author `.env.example` (env contract) | ✅ | Full contract; validated by Zod. |
| 7 | Enterprise folder skeleton under `src/lib/`, `src/components/`, `src/services/`, `src/types/`, `supabase/migrations/`, `docs/`, `scripts/` | ✅ | Per Task 1. |
| 8 | `src/lib/config/env.ts` — Zod-validated, namespaced env | ✅ | Throws `ConfigurationError` on bad config. |
| 9 | `src/lib/config/index.ts` — barrel | ✅ | Re-exports `env`, `Env`, `EnvSchema`. |
| 10 | `src/lib/errors/index.ts` — `AppError` hierarchy + `toAppError()` | ✅ | 12 domain subclasses; `internal` flag. |
| 11 | `src/lib/logger/index.ts` — structured logger | ✅ | 5 levels, sinks, request-scoped child loggers. |
| 12 | `src/lib/utils.ts` — `cn()` | ✅ | Tailwind class merge. |
| 13 | `src/lib/supabase/` — browser / server / admin clients | 🚧 | Planned in Task 2-b. |
| 14 | `src/lib/auth/` — session + RBAC helpers | 🚧 | Planned in Task 2-b. |
| 15 | `src/lib/storage/` — Supabase Storage wrappers | 🚧 | Planned in Task 2-b. |
| 16 | `src/lib/ai/` — provider registry + facade (7 providers) | 🚧 | Planned in Task 2-c. |
| 17 | `src/lib/billing/` — provider registry + facade (3 providers) | 🚧 | Planned in Task 2-c. |
| 18 | `src/lib/rate-limit/` — sliding-window limiter | 🚧 | Planned in Task 2-c. |
| 19 | `src/lib/feature-flags/` — env + DB flags | 🚧 | Planned in Task 2-c. |
| 20 | `src/lib/security/` — AES-256-GCM crypto, hashing, JWT | 🚧 | Planned in Task 2-c. |
| 21 | `src/lib/redis/` — ioredis + in-memory fallback | 🚧 | Planned in Task 2-c. |
| 22 | `src/lib/validation/` — Zod schemas | 🚧 | Planned in Task 2-c. |
| 23 | `src/lib/middleware/` — `withAuth`, `withRateLimit`, `withCsrf` | 🚧 | Planned in Task 2-c. |
| 24 | `src/lib/cache/` — cache wrappers | 🚧 | Planned in Task 2-c. |
| 25 | `src/lib/constants/` — domain constants | 🚧 | Planned in Task 2-c. |
| 26 | `src/lib/types/` — shared types | 🚧 | Planned in Task 2-c. |
| 27 | `supabase/migrations/0001_init.sql` — full schema + RLS | 🚧 | Planned in Task 2-b; see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md). |
| 28 | Dashboard shell + theme system | 🚧 | Planned in Task 2-d (Wave 2). |
| 29 | Documentation set (10 files) | ✅ | This file + 9 others; see [`README.md`](README.md). |

**Exit criteria.** All 🚧 items flip to ✅; `bun run lint && bun run typecheck && bun run build` pass; a fresh `supabase db push` on an empty project succeeds; the dashboard shell renders at `/dashboard` for an authenticated user.

---

## Phase 2 — AI Chat 📋

**Goal.** Ship a ChatGPT-class chat experience: conversational UI, streaming responses, model picker across 7 providers, prompt library, conversation history, organization-scoped threads.

**Dependencies:** Phase 1 (AI provider abstraction, rate limiting, usage_records, ai_conversations/ai_messages tables).

### Key modules
- `src/app/(dashboard)/chat/` — chat page + conversation list.
- `src/components/dashboard/chat/` — `ChatWindow`, `MessageBubble`, `Composer`, `ModelPicker`, `ConversationSidebar`.
- `src/app/api/ai/chat/route.ts` and `/api/ai/chat/stream/route.ts`.
- `src/services/chat-service.ts` — orchestration (auth, rate-limit, provider call, persistence, usage write).
- Prompt library: `src/lib/ai/prompts/*.ts` (system prompt presets), stored in `ai_conversations.system_prompt`.

### Scope
- Streaming UI with token-by-token rendering and cancel button.
- Conversation create / rename / archive / delete.
- Model picker with cost + latency hints per provider/model.
- Prompt library with categories (writing, coding, analysis, brainstorm).
- Usage dashboard: per-day token totals + cost estimate.
- Quota enforcement: per-tier message caps and overage paywall.

---

## Phase 3 — Image Generation 📋

**Goal.** Text-to-image generation, gallery, asset management, provider routing (DALL-E 3, Imagen, Stable Diffusion via OpenRouter, others).

**Dependencies:** Phase 1 (storage layer, `ai-assets` bucket, `files` table), Phase 2 (provider registry pattern reused for image models).

### Key modules
- `src/lib/ai/image-providers/` — extends the provider registry with `imageGenerate(req)` interface.
- `src/app/(dashboard)/images/` — generation UI + gallery.
- `src/components/dashboard/images/` — `ImagePromptForm`, `ImageGrid`, `ImageDetailDialog`.
- `src/app/api/ai/image/route.ts` — generation endpoint.

### Scope
- Prompt → image (one or N variants per request).
- Aspect ratio presets; style presets.
- Gallery with infinite scroll, search by prompt.
- Download as PNG/JPG, share via signed URL.
- Per-image cost tracking in `usage_records` with `operation = 'image'`.

---

## Phase 4 — Business Tools 📋

**Goal.** Notion AI-class embedded assistants: document AI (summarize, rewrite, expand), email drafter, meeting summarizer, spreadsheet assistant.

**Dependencies:** Phase 1 (storage, AI facade), Phase 2 (chat infra reused for inline completions).

### Key modules
- `src/app/(dashboard)/tools/` — tool landing + each tool.
- `src/services/tool-orchestrator.ts` — composes a tool-specific system prompt + user input + AI facade.
- Document editor: `@mdxeditor/editor` (already a dependency) + AI sidebar.

### Scope
- Document AI: highlight → "improve", "shorten", "translate", "expand".
- Email drafter: from bullet points → polished email in chosen tone.
- Meeting summarizer: upload transcript or audio (Whisper via OpenAI) → summary + action items.
- Spreadsheet assistant: connect to a sheet, ask questions, get formulae + charts.
- Templates: pre-built prompts shipped as `src/lib/ai/prompts/business/*.ts`.

---

## Phase 5 — Marketplace 📋

**Goal.** A creator-driven marketplace for prompt packs, custom tools, and templates. Stripe Connect for payouts; revenue share model.

**Dependencies:** Phase 1 (billing, auth, RLS for org-scoped listings), Phase 2–4 (the artifacts being sold: prompts, tools, templates).

### Key modules
- `supabase/migrations/000X_marketplace.sql` — `listings`, `purchases`, `creator_profiles`, `payouts` tables.
- `src/app/(dashboard)/marketplace/` — browse + buy + creator dashboard.
- `src/lib/billing/providers/stripe-connect.ts` — Connect onboarding + transfers.
- `src/services/payout-service.ts` — daily/weekly payout scheduler.

### Scope
- Creator onboarding: Stripe Connect Express account, KYC.
- Listing CRUD with media, pricing tiers, versioning.
- Discovery: search, categories, ratings, featured carousel.
- Purchase flow: checkout → access grant → usage tracking → creator dashboard.
- Revenue share (e.g., 80/20 creator/platform), payouts weekly with minimum threshold.

---

## Phase 6 — Scaling & Enterprise 📋

**Goal.** Enterprise readiness: SSO/SAML, audit logs, multi-region, on-prem AI gateway, SLA monitoring.

**Dependencies:** Phases 1–5 all stable; significant load in production to justify scale-out work.

### Key modules
- `src/lib/auth/sso/` — SAML 2.0 + OIDC enterprise providers.
- `supabase/migrations/000X_audit_logs.sql` — `audit_events` table (append-only, partitioned).
- `src/lib/middleware/audit.ts` — wraps every mutating route to write an audit event.
- `src/lib/ai/gateway/` — on-prem AI gateway routing for enterprise tenants.
- Observability: Sentry, Datadog, OpenTelemetry sinks fully wired.

### Scope
- SSO/SAML for Okta, Azure AD, Google Workspace.
- Audit log UI with filtering, CSV export, retention policies.
- Multi-region read replicas + connection pooler (PgBouncer).
- On-prem AI gateway: route enterprise tenant traffic to their own LLM endpoints.
- 99.95% uptime SLO with status page + postmortem workflow.
- SOC 2 / ISO 27001 readiness (process + controls documentation).

---

## Cross-phase principles

1. **Each phase is independently shippable.** No phase is "demo-ware"; each ends in a production-ready release behind a feature flag.
2. **Foundation contracts don't break.** The Phase 1 envelope (`ApiResponse<T>`), error codes, and env contract are stable across all phases. New endpoints add new codes; existing codes don't change meaning.
3. **Provider count grows monotonically.** A new AI or billing provider is a single file in `src/lib/ai/providers/` or `src/lib/billing/providers/`; no existing call site changes.
4. **Documentation updates with code.** Every PR that adds or changes a public surface updates the relevant doc(s) in this set of 10.

---

## Cross-references

- For the engineering task tracker, see [`TASKS.md`](TASKS.md).
- For the technical architecture, see [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md).
- For product vision + NFRs, see [`PROJECT_SPECIFICATION.md`](PROJECT_SPECIFICATION.md).
- For per-release changes, see [`CHANGELOG.md`](CHANGELOG.md).
