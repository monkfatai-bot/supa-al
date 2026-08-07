# Changelog

All notable changes to Supa AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-08-04

**Phase 1: Foundation.**

The first tagged release of Supa AI. Establishes the platform's enterprise-grade foundation: env validation, error hierarchy, structured logger, the Supabase integration scaffolding, AI / billing / rate-limit / security / storage module skeletons, the dashboard shell roadmap, and the full documentation set.

> **Note on completeness.** Several `src/lib/*` modules and `supabase/migrations/0001_init.sql` are being authored in parallel by sibling agents (Tasks 2-b, 2-c, 2-d) at the time of this release. They are tracked as ⚠️ in [`TASKS.md`](TASKS.md) and 🚧 in [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md). The contracts documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md), [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md), [`API_SPECIFICATION.md`](API_SPECIFICATION.md), and [`SECURITY.md`](SECURITY.md) are normative — parallel work lands against these contracts.

### Added

- **Enterprise folder structure** under `src/lib/` (`config`, `errors`, `logger`, `supabase`, `auth`, `storage`, `ai`, `billing`, `rate-limit`, `feature-flags`, `security`, `redis`, `validation`, `utils`, `middleware`, `cache`, `constants`), `src/types/`, `src/services/`, `src/hooks/`, `src/components/{layout,dashboard,providers,settings,shared,ui}`, `supabase/migrations/`, `docs/`, `scripts/`.
- **Env validation** at [`src/lib/config/env.ts`](src/lib/config/env.ts) — Zod schema mirroring [`.env.example`](.env.example), namespaced immutable `env` object (`env.app`, `env.supabase`, `env.redis`, `env.ai`, `env.payments`, `env.security`, `env.features`), `ConfigurationError` thrown at boot on bad config.
- **Error hierarchy** at [`src/lib/errors/index.ts`](src/lib/errors/index.ts) — `AppError` base class with `code` (`ErrorCode` union), `statusCode`, `details`, `internal` flag, `toJSON()`. Twelve domain subclasses: `ConfigurationError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `PaymentError`, `AIProviderError`, `DatabaseError`, `StorageError`, `ExternalServiceError`. Plus `toAppError(unknown)` normalizer that wraps unknown thrown values as `INTERNAL_ERROR` so unexpected crashes never leak internals.
- **Structured logger** at [`src/lib/logger/index.ts`](src/lib/logger/index.ts) — five levels (`debug`/`info`/`warn`/`error`/`fatal`), pluggable `LogSink` interface (default `ConsoleSink`: pretty in dev, single-line JSON in prod), `logger.child(ctx)` for request-scoped loggers via `createRequestLogger({ requestId, userId })`. Reads `NODE_ENV` directly (not `env`) to avoid a circular dependency at boot.
- **Supabase stack** — `@supabase/supabase-js` + `@supabase/ssr` installed; three-client architecture (browser / server / admin) documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §2.2 (🚧 in parallel).
- **AI provider abstraction** (7 providers) — registry + facade pattern documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §4. Providers: OpenAI, Anthropic Claude, Google Gemini, OpenRouter, DeepSeek, Qwen, Grok. SDKs `openai`, `@anthropic-ai/sdk`, `@google/generative-ai` installed.
- **Billing provider abstraction** (3 providers) — registry + facade pattern documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §5. Providers: Stripe, Paystack, Flutterwave. SDKs `stripe` + `@stripe/stripe-js` installed.
- **Rate-limit system** — sliding-window limiter with per-IP + per-user scope, six presets (`auth`, `ai.chat`, `ai.chat.stream`, `billing.checkout`, `upload`, `global`), fail-closed in production (see [`SECURITY.md`](SECURITY.md) §7).
- **Feature-flag system** — env-driven defaults (`FEATURE_CHAT_ENABLED`, etc.) with planned runtime overrides from Supabase; documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §11.
- **Security / crypto layer** — AES-256-GCM field-level encryption, SHA-256 + pepper API-key hashing, HS256 JWT signing; documented in [`SECURITY.md`](SECURITY.md) §4–6.
- **In-memory fallback philosophy** — Redis-backed modules (`rate-limit`, `cache`, future queue) fall back to in-memory `Map` implementations when `env.redis.enabled === false`, eliminating a hard dev dependency while keeping production fail-closed.
- **Error normalization strategy** — every cross-boundary throw is normalized to `AppError` via `toAppError()`; the `internal` flag controls message exposure to clients. Documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §8.
- **Dashboard shell roadmap** — `src/components/{layout,dashboard,providers,settings,shared}` skeleton + planned pages documented in [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) Phase 1.5 and [`TASKS.md`](TASKS.md) §1.5.
- **Theme system** — Tailwind 4 + shadcn/ui (New York) + `next-themes` (planned in Task 2-d); dark mode tokens present in [`src/app/globals.css`](src/app/globals.css).
- **Full shadcn/ui New York component set** under `src/components/ui/` (accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip).
- **Project documentation set** (10 files) — `README.md`, `PROJECT_ARCHITECTURE.md`, `PROJECT_SPECIFICATION.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `SECURITY.md`, `DEPLOYMENT.md`, `MASTER_ROADMAP.md`, `TASKS.md`, `CHANGELOG.md`.
- **Scripts** in `package.json`: `dev` (port 3000, logs to `dev.log`), `lint`, `typecheck`, `build` (standalone + copy `static/` and `public/`), `start` (production standalone server).
- **TypeScript strict mode** + `@/*` path alias → `./src/*` (see [`tsconfig.json`](tsconfig.json)).
- **Next.js 16 standalone build** (`output: "standalone"` in [`next.config.ts`](next.config.ts)) for trivial Docker packaging.

### Changed

- **Database migrated from Prisma + SQLite to Supabase PostgreSQL.** The Prisma client, schema, migrations, and `db:*` scripts were removed (see "Removed" below). Supabase provides managed Postgres, Auth, Storage, and Realtime as an integrated stack — auth, RLS, and storage are now solved at the database tier rather than reinvented in application code. Rationale documented in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §9.
- **Environment variable handling centralized.** Every `process.env` read now flows through [`src/lib/config/env.ts`](src/lib/config/env.ts). Scattered `process.env.X` reads across the codebase are an anti-pattern; the validated `env` object is the single source of truth.
- **Error handling standardized.** Domain code throws `AppError` subclasses; route handlers wrap their body in `try/catch` + `toAppError()`; the `ApiResponse<T>` envelope is the only response shape (see [`API_SPECIFICATION.md`](API_SPECIFICATION.md) §2).
- **Logging standardized.** The structured `logger` replaces ad-hoc `console.log` calls in production paths; pretty output in dev, single-line JSON in prod (see [`src/lib/logger/index.ts`](src/lib/logger/index.ts)).

### Removed

- **Prisma ORM** — `prisma/` directory deleted; `@prisma/client` and `prisma` packages removed from `package.json`; `db:*` npm scripts stripped. The migration to Supabase is irreversible; re-adding Prisma would conflict with the RLS-first design.
- **SQLite database** — no longer present. SQLite was the Prisma default for local dev; Supabase now provides both local (CLI) and cloud Postgres.
- **`src/lib/db.ts`** — the Prisma client entry point; deleted with the Prisma migration.

### Security

- **Env validation at boot.** `src/lib/config/env.ts` rejects unknown variables and throws `ConfigurationError` on missing/invalid required ones. The process fails fast rather than degrading silently.
- **`SUPABASE_SERVICE_ROLE_KEY` isolation.** The admin client (which bypasses RLS) is confined to back-office paths and imports `"server-only"`; it can never be bundled into a client chunk.
- **`ENCRYPTION_KEY` enforcement.** Zod regex requires a 32-byte hex string (64 chars); invalid keys fail at boot.
- **`internal` error flag.** `AppError.internal === true` causes the API layer to replace the message with `"An internal error occurred."` before responding — internal stack-trace-level details never reach clients. See [`SECURITY.md`](SECURITY.md) §11.
- **Fail-closed rate limiting in production.** If `env.app.isProd && !env.redis.enabled`, the process refuses to start. If Redis is unreachable at runtime, rate-limited endpoints return `429` rather than allowing a burst. See [`SECURITY.md`](SECURITY.md) §7.2.
- **Webhook signature verification** documented for all three payment providers (Stripe HMAC-SHA256, Paystack HMAC-SHA512, Flutterwave HMAC-SHA256) with constant-time comparison. See [`SECURITY.md`](SECURITY.md) §8.
- **CSP + security headers** documented (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP). See [`SECURITY.md`](SECURITY.md) §9.
- **OWASP Top 10 threat model** mapping every risk to a Supa AI control. See [`SECURITY.md`](SECURITY.md) §12.
- **RLS default-deny policy** documented for all 9 tables (`users`, `organizations`, `organization_members`, `subscriptions`, `usage_records`, `api_keys`, `ai_conversations`, `ai_messages`, `files`). See [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) §2.

---

## [Unreleased]

Tracked in [`TASKS.md`](TASKS.md). Highlights of what's landing next from parallel agents:

- `src/lib/supabase/{browser,server,admin}.ts` (Task 2-b)
- `src/lib/auth/*` session + RBAC helpers (Task 2-b)
- `src/lib/storage/*` Supabase Storage wrappers (Task 2-b)
- `supabase/migrations/0001_init.sql` — full schema + RLS + storage buckets + triggers (Task 2-b)
- `src/lib/ai/{registry,facade,types,providers/*}.ts` — 7-provider AI abstraction (Task 2-c)
- `src/lib/billing/{registry,facade,types,providers/*}.ts` — 3-provider billing abstraction (Task 2-c)
- `src/lib/rate-limit/*`, `src/lib/feature-flags/*`, `src/lib/security/*`, `src/lib/redis/*`, `src/lib/cache/*`, `src/lib/validation/*`, `src/lib/middleware/*`, `src/lib/constants/*` (Task 2-c)
- Dashboard shell + theme system + auth pages (Task 2-d)
- `Dockerfile` + `.github/workflows/ci.yml` + `render.yaml` (tooling)

---

## Cross-references

- For the full engineering task tracker, see [`TASKS.md`](TASKS.md).
- For phase status, see [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md).
- For the technical architecture, see [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md).
- For the worklog (including this release's Task 1 + Task 2-e entries), see [`worklog.md`](worklog.md).
