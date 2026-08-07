# Supa AI

> **Phase 1 — Foundation.** Production-grade AI SaaS platform (chat · image generation · business tools · marketplace) built on Next.js 16 + Supabase.

[![Status: Phase 1 — Foundation](https://img.shields.io/badge/status-Phase%201%20Foundation-blue)](PROJECT_ARCHITECTURE.md)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-149eca)](https://react.dev)
[![TypeScript 5 strict](https://img.shields.io/badge/TypeScript-5%20strict-3178c6)](https://www.typescriptlang.org)
[![Tailwind 4](https://img.shields.io/badge/Tailwind-4-38bdf8)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Auth%20%2B%20Storage-3ECF8E)](https://supabase.com)
[![License: Private](https://img.shields.io/badge/license-private-lightgrey)](#license)

---

## What is Supa AI?

Supa AI is an all-in-one AI SaaS platform — a single product that fuses the experience of ChatGPT (conversational AI), Claude (long-context reasoning), Notion AI (in-document assistance), and Canva AI (visual generation). It is being built in six phases; this repository currently contains **Phase 1 — the foundation**: env validation, error hierarchy, structured logger, Supabase integration scaffolding, AI/billing/rate-limit/security module skeletons, and the dashboard shell.

The foundation is deliberately provider-agnostic and policy-driven so that later phases (chat, image generation, business tools, marketplace) compose on top of the same abstractions.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, `output: "standalone"`) | RSC, Server Actions, route handlers. |
| Language | **TypeScript 5** (`strict: true`) | `@/*` path alias → `./src/*`. |
| UI | **React 19**, **Tailwind CSS 4**, **shadcn/ui** (New York), **Framer Motion** | Full shadcn component set installed. |
| Backend | **Supabase** (PostgreSQL + Auth + Storage) | No Prisma, no SQLite. RLS-enforced. |
| Cache / Queue | **Redis** via `ioredis` | In-memory fallback when `REDIS_URL` is empty (dev). |
| AI providers | OpenRouter, OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Grok | Pluggable registry + facade. |
| Payments | Stripe, Paystack, Flutterwave | Pluggable registry + facade. |
| State / data | Zustand, TanStack Query, TanStack Table, React Hook Form + Zod | |
| Package manager | **Bun** | Scripts wired in `package.json`. |
| Deployment | Docker, GitHub Actions, Vercel, Render | |

## Quickstart

### Prerequisites
- **Bun** ≥ 1.3 (or Node.js 20+ as fallback)
- A **Supabase** project (URL, anon key, service-role key)
- (Optional) A **Redis** instance — leave `REDIS_URL` empty for in-memory fallback

### Install & run

```bash
# 1. Install dependencies
bun install

# 2. Copy the env contract and fill in your values
cp .env.example .env
#   → Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#     SUPABASE_SERVICE_ROLE_KEY, AUTH_SECRET, JWT_SECRET, ENCRYPTION_KEY
#     (generate the last three with: openssl rand -base64 32
#      and ENCRYPTION_KEY with: openssl rand -hex 32)

# 3. Run the database migrations (Supabase CLI or dashboard SQL editor)
supabase db push   # applies supabase/migrations/*.sql

# 4. Start the dev server (port 3000)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Every variable is validated at boot by `src/lib/config/env.ts` (Zod). The process fails fast with a `ConfigurationError` if the contract is broken — see [`.env.example`](.env.example) for the canonical contract and [`SECURITY.md`](SECURITY.md) for secrets-management rules.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start Next.js dev server on port 3000 (logs to `dev.log`). |
| `bun run lint` | Run ESLint (`eslint .`). |
| `bun run typecheck` | Run `tsc --noEmit` (no emit, type-check only). |
| `bun run build` | `next build` + copies `static/` and `public/` into `.next/standalone/` for Docker. |
| `bun run start` | Run the standalone production server (`bun .next/standalone/server.js`). |

## Folder structure

```
supa-ai/
├── src/
│   ├── app/                      # Next.js App Router (routes, layouts, API handlers)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/                  # Route handlers — see API_SPECIFICATION.md
│   ├── components/
│   │   ├── ui/                   # shadcn/ui New York (full set)
│   │   ├── layout/               # App shell, sidebar, topbar (planned)
│   │   ├── dashboard/            # Dashboard widgets (planned)
│   │   ├── providers/            # React context providers (planned)
│   │   ├── settings/             # Settings panels (planned)
│   │   └── shared/               # Cross-cutting presentational components (planned)
│   ├── hooks/                    # React hooks (use-mobile, use-toast, …)
│   ├── lib/                      # Server-first domain modules — see below
│   │   ├── config/               # env.ts (Zod-validated) + barrel
│   │   ├── errors/               # AppError hierarchy + toAppError normalizer
│   │   ├── logger/               # Structured logger (levels, sinks, child loggers)
│   │   ├── supabase/             # Browser + server + admin clients (planned)
│   │   ├── auth/                 # Session, RBAC helpers (planned)
│   │   ├── storage/              # Supabase Storage wrappers (planned)
│   │   ├── ai/                   # Provider registry + facade (planned)
│   │   ├── billing/              # Payment provider registry + facade (planned)
│   │   ├── rate-limit/           # Sliding-window limiter (planned)
│   │   ├── feature-flags/        # Env + DB-backed flags (planned)
│   │   ├── security/             # crypto: AES-256-GCM, hashing, JWT (planned)
│   │   ├── redis/                # ioredis + in-memory fallback (planned)
│   │   ├── validation/           # Zod schemas (planned)
│   │   ├── middleware/           # Next.js middleware helpers (planned)
│   │   ├── cache/                # Cache wrappers (planned)
│   │   ├── utils/                # Pure helpers (planned)
│   │   └── constants/            # Domain constants (planned)
│   ├── services/                 # Orchestration layer (use-case services) (planned)
│   └── types/                    # Shared TypeScript types (planned)
├── supabase/
│   └── migrations/               # SQL migrations — see DATABASE_SCHEMA.md (planned)
├── public/                       # Static assets (logo.svg, robots.txt)
├── docs/                         # Long-form internal docs
├── scripts/                      # One-off ops scripts (planned)
├── .env.example                  # The env contract
├── package.json
├── tsconfig.json
├── next.config.ts                # output: "standalone"
├── eslint.config.mjs
├── tailwind.config.ts
├── components.json               # shadcn config (style: new-york)
└── *.md                          # The 10 project docs (this file + 9 others)
```

> Items marked **(planned)** are being built in parallel by sibling agents or scheduled for later phases — see [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) and [`TASKS.md`](TASKS.md) for status.

## Documentation index

| Document | Purpose |
|---|---|
| [README.md](README.md) | This file — overview, quickstart, scripts. |
| [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) | Layered architecture, module dependency graph, AI/billing provider abstractions, error normalization. |
| [PROJECT_SPECIFICATION.md](PROJECT_SPECIFICATION.md) | Product vision, personas, phased roadmap summary, NFRs, design principles, conventions. |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Supabase PostgreSQL schema: every table, RLS policies, indexes, ER diagram. |
| [API_SPECIFICATION.md](API_SPECIFICATION.md) | REST + Server Action contract: envelope, auth, rate-limit headers, Phase 1 endpoints. |
| [SECURITY.md](SECURITY.md) | Auth model, RLS, encryption, API-key hashing, webhooks, CSP, OWASP threat model. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Local dev, env matrix, Supabase/Redis setup, Docker, CI/CD, Vercel/Render, pre-deploy checklist. |
| [MASTER_ROADMAP.md](MASTER_ROADMAP.md) | Six-phase roadmap with ✅/🚧/📋 status markers. |
| [TASKS.md](TASKS.md) | Engineering task tracker — Phase 1 deliverables checklist + Phase 2+ backlog. |
| [CHANGELOG.md](CHANGELOG.md) | Keep-a-Changelog format. |

## License

Private / proprietary. All rights reserved.
