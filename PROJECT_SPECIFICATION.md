# Project Specification

> **Purpose.** This document is the canonical product + engineering spec for Supa AI. It defines **what** we are building, **who** it is for, **how** the work is phased, the **non-functional requirements** the system must meet, and the **engineering conventions** every contributor must follow. Implementation details live in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md); status lives in [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md); task tracking lives in [`TASKS.md`](TASKS.md).

---

## 1. Product vision

**Supa AI** is a single, production-grade AI SaaS platform that consolidates four product categories into one experience:

1. **Conversational AI** (ChatGPT-class) — multi-provider chat with streaming, prompt library, conversation history, and model picker across 7 LLM providers.
2. **Long-context reasoning** (Claude-class) — large-context windows for document analysis, code review, and research synthesis.
3. **In-document assistance** (Notion AI-class) — embedded AI in rich-text documents and business tools.
4. **Visual generation** (Canva AI-class) — text-to-image, image editing, and template-driven design.

The product is opinionated about provider abstraction: end users select a capability ("summarize this", "draft an email", "generate a hero image"); the platform routes to the best provider for the job and abstracts the cost, latency, and idiosyncrasies away.

### What makes Supa AI different

- **Provider-agnostic by design.** No single AI vendor is a hard dependency; the registry/facade pattern lets new providers land in a single file.
- **Multi-gateway payments.** Stripe (cards, global), Paystack (Africa), Flutterwave (Africa + emerging markets) — the same abstraction.
- **Secure by default.** RLS at the database tier; AES-256-GCM field-level encryption for secrets; signed webhooks; per-IP + per-user rate limits.
- **Tiered feature rollout.** Every major surface sits behind a feature flag, so dark launches and gradual rollouts are first-class.

---

## 2. Target personas

| Persona | Role | Primary need |
|---|---|---|
| **Solo Creator** | Individual user | Chat + image generation for personal productivity; pays per-seat monthly. |
| **Team Lead** | Mid-market manager | Brings 5–50 teammates into a shared workspace; needs org-scoped data, usage limits, and admin controls. |
| **Developer / API user** | Technical user | Wants API keys to programmatically call Supa AI from their stack; cares about rate limits, usage analytics, and SLAs. |
| **Marketplace Creator** | Independent vendor (Phase 5) | Sells prompt packs, custom tools, and templates on the Supa AI marketplace. |
| **Enterprise Admin** | Large-org IT (Phase 6) | SSO, audit logs, custom contracts, on-prem AI gateway routing. |

---

## 3. Phased roadmap summary

Six phases; each phase is independently shippable and depends only on prior phases.

| Phase | Theme | Status | Exit criteria |
|---|---|---|---|
| **Phase 1** | Foundation | 🚧 in progress | All `src/lib/*` modules pass lint + typecheck + smoke boot; env contract enforced; migrations apply on a fresh Supabase project; dashboard shell renders. |
| **Phase 2** | AI Chat | 📋 planned | Conversation UI, streaming responses, model picker, prompt library, conversation history. |
| **Phase 3** | Image Generation | 📋 planned | Text-to-image flow, gallery, asset management, provider routing (DALL-E, Imagen, Stable Diffusion via OpenRouter). |
| **Phase 4** | Business Tools | 📋 planned | Document AI, email drafter, meeting summarizer, spreadsheet assistant — all powered by the same provider facade. |
| **Phase 5** | Marketplace | 📋 planned | Creator onboarding, listing discovery, payouts via Stripe Connect, revenue share. |
| **Phase 6** | Scaling & Enterprise | 📋 planned | SSO/SAML, audit logs, multi-region, on-prem AI gateway, SLA monitoring. |

See [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) for the deliverable list under each phase and [`TASKS.md`](TASKS.md) for the per-task checklist.

---

## 4. Non-functional requirements (NFRs)

### 4.1 Performance budgets

| Surface | Budget | Measurement |
|---|---|---| 
| First Contentful Paint (landing) | ≤ 1.2s on 4G | Lighthouse, p75. |
| Time to First Token (chat, streaming) | ≤ 800 ms after request leaves browser | Server-side instrumentation. |
| API p50 latency (non-AI) | ≤ 120 ms | APM trace, rolling 5 min. |
| API p95 latency (non-AI) | ≤ 400 ms | APM trace, rolling 5 min. |
| Bundle size (first load JS, app shell) | ≤ 250 KB gzipped | `next build` output. |
| Database query p95 | ≤ 50 ms | Supabase logs. |

### 4.2 Availability

- **Target SLO:** 99.9% monthly uptime for the application tier (≤ 43.2 min downtime/month).
- **Database SLO:** inherits Supabase's 99.9% managed Postgres SLA.
- **Degradation strategy:** if Redis is unreachable in production, the app **must fail closed** on rate-limited endpoints rather than fail open. In dev, the in-memory fallback is used.

### 4.3 Security

- RLS on every table; default-deny.
- AES-256-GCM for field-level encryption of secrets at rest.
- SHA-256 + pepper for API key hashing (raw keys never stored).
- Webhook signatures verified for Stripe / Paystack / Flutterwave.
- Zod validation at every public boundary (API routes, Server Actions, form inputs).
- See [`SECURITY.md`](SECURITY.md) for the full threat model.

### 4.4 Scalability

- **Target load (Phase 6):** 1M MAU, 10M chat messages/day, 100k image generations/day.
- **Horizontal scaling:** Next.js standalone build → containerized → stateless behind a load balancer. No in-process session state (Supabase cookie sessions).
- **Database scaling:** Supabase read replicas + connection pooler (PgBouncer) for read-heavy paths.
- **Cache:** Redis for rate-limit counters, session cache, hot config — never for authoritative state.
- **AI scaling:** Provider-side; Supa AI enforces concurrency caps per user to avoid thundering herds.

### 4.5 Observability

- Structured logs (JSON in prod, pretty in dev) — see [`src/lib/logger/index.ts`](src/lib/logger/index.ts).
- Request IDs propagated end-to-end (logged at every layer).
- Pluggable sinks: Sentry (errors), Datadog/Logtail (logs), OpenTelemetry (traces) — added in later phases without touching call sites.

### 4.6 Internationalization

- Phase 1: English-only UI strings; date/number formatting via `date-fns`.
- Phase 4+: i18next or next-intl, locale routing under `/<locale>/`.

---

## 5. Design principles

### 5.1 SOLID

- **Single Responsibility.** Every `src/lib/*` module has one concern; cross-cutting concerns (logging, errors, config) live in their own modules.
- **Open/Closed.** New AI/billing providers are added by registering an adapter — no edits to existing call sites.
- **Liskov.** Every `ProviderAdapter` / `BillingAdapter` honors the full interface contract; substitutes are transparent to the facade.
- **Interface Segregation.** The `ai/` facade exposes `aiChat` / `aiChatStream` / `listModels` — narrow, purpose-driven interfaces, not a god object.
- **Dependency Inversion.** Domain layers depend on abstractions (`ProviderAdapter`); concrete adapters are injected via the registry.

### 5.2 Modular

- Every module is independently importable; barrel `index.ts` files enforce the public surface.
- `import "server-only"` in every `src/lib/*` module that touches secrets, the database, or provider SDKs.
- No circular imports — enforced by layering (see [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §2).

### 5.3 Secure by default

- Deny-by-default RLS on every table.
- Server actions and route handlers wrap their entire body in `toAppError()`; internal messages never reach clients.
- Secrets live only in `env` and in `src/lib/security/` — never in client bundles, never logged.
- Every external-facing input passes through a Zod schema before being used.

### 5.4 Fully typed

- `strict: true` in `tsconfig.json`.
- `unknown` over `any` at boundaries.
- Shared types live in `src/types/` (planned); domain types co-located with their module (`src/lib/ai/types.ts`, etc.).
- `as const` for stable enum-like objects (see `env.ts`).

---

## 6. Conventions

### 6.1 Naming

| Element | Convention | Example |
|---|---|---|
| Files (modules) | `kebab-case.ts` | `rate-limit.ts` |
| Files (components) | `PascalCase.tsx` | `DashboardSidebar.tsx` |
| Directories | `kebab-case` | `src/lib/rate-limit/` |
| Functions | `camelCase` | `createCheckoutSession` |
| Types / Interfaces | `PascalCase` | `ChatRequest`, `BillingAdapter` |
| Constants | `SCREAMING_SNAKE_CASE` | `RATE_LIMIT_PRESETS` |
| Env vars | `SCREAMING_SNAKE_CASE`, prefixed `NEXT_PUBLIC_` if client-visible | `NEXT_PUBLIC_SUPABASE_URL`, `STRIPE_SECRET_KEY` |
| Database tables | `snake_case`, plural | `ai_conversations`, `usage_records` |
| Database columns | `snake_case` | `created_at`, `org_id` |
| Route handlers | `/api/<domain>/<action>` | `/api/ai/chat`, `/api/billing/checkout` |

### 6.2 File placement

| Content | Location |
|---|---|
| React components | `src/components/<area>/` |
| Domain logic (server) | `src/lib/<domain>/` |
| Pure shared types | `src/types/` |
| API routes | `src/app/api/<domain>/<action>/route.ts` |
| Pages | `src/app/<route>/page.tsx` |
| Layouts | `src/app/<route>/layout.tsx` |
| React hooks | `src/hooks/` |
| Orchestration (multi-module use-cases) | `src/services/` |
| SQL migrations | `supabase/migrations/` |
| Ops scripts | `scripts/` |

### 6.3 Error handling

- Never `throw new Error("...")` in domain code — throw an `AppError` subclass.
- Never `throw "string"` or `throw undefined`.
- Always wrap third-party SDK calls in `try/catch` and rethrow as the appropriate `AppError` subclass (e.g., OpenAI SDK errors → `AIProviderError`).
- Route handlers and Server Actions wrap their entire body in `try/catch` and call `toAppError(err)`; the response shape is the `ApiResponse<T>` envelope (see [`API_SPECIFICATION.md`](API_SPECIFICATION.md)).
- The `internal` flag on `AppError` controls whether the message is safe to expose. When in doubt, default to `internal: true`.

### 6.4 Logging

- Import `logger` from `@/lib/logger` — never `console.log` in production paths.
- For request-scoped work, create a child logger: `const log = createRequestLogger({ requestId, userId });`.
- **Never log secrets, raw API keys, JWTs, or PII.** Structured context should hold identifiers (`userId`, `orgId`, `conversationId`), not credentials.
- Use `log.error()` for caught exceptions with `{ err: toAppError(e).toJSON() }` as context.

### 6.5 Git & PRs

- Conventional commits: `feat(ai): add deepseek provider`, `fix(billing): correct paystack signature`, `docs: add SECURITY.md`.
- Every PR must pass `bun run lint`, `bun run typecheck`, `bun run build`.
- Every PR touches at most one phase's surface area unless explicitly approved.

### 6.6 Testing (planned for Phase 1+)

- Unit tests co-located with the module: `src/lib/ai/facade.test.ts`.
- Integration tests under `tests/`.
- Use Bun's test runner (`bun test`) once configured.

---

## 7. Definition of Done (per Phase 1 deliverable)

A foundation module is "done" when **all** of the following are true:

1. ✅ Module file exists under the correct `src/lib/<domain>/` path.
2. ✅ Exports are surfaced through a barrel `index.ts`.
3. ✅ Imports `"server-only"` if it touches secrets / DB / provider SDKs.
4. ✅ All thrown errors are `AppError` subclasses.
5. ✅ All cross-module inputs are validated with Zod at the public boundary.
6. ✅ `bun run lint` and `bun run typecheck` pass.
7. ✅ Module is documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) and reflected in [`TASKS.md`](TASKS.md).
8. ✅ Any new env vars are added to [`.env.example`](.env.example) **and** to the Zod schema in [`src/lib/config/env.ts`](src/lib/config/env.ts).

---

## 8. Out of scope (Phase 1)

To keep the foundation tight, the following are **explicitly excluded from Phase 1** and will be tackled in later phases:

- Chat UI, streaming UI, prompt library — Phase 2.
- Image generation pipeline — Phase 3.
- Business tools (doc AI, email drafter, meeting summarizer) — Phase 4.
- Marketplace listings, payouts, revenue share — Phase 5.
- SSO/SAML, audit log UI, multi-region failover — Phase 6.
- Mobile apps (native) — not on the current roadmap.
- On-prem air-gapped deployment — Phase 6 enterprise tier.
