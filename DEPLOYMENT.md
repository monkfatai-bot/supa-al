# Deployment

> **Purpose.** This document tells you how to run Supa AI everywhere: your laptop, a staging cluster, and production on Docker / Vercel / Render. It covers env matrix, Supabase setup, Redis provisioning, payment-provider onboarding, the Docker build, CI/CD, and a pre-deploy checklist.

> **Status.** Phase 1. The `Dockerfile` and `.github/workflows/*` are 📋 planned; the conventions and commands below are normative. The `next.config.ts` already sets `output: "standalone"` to make the Docker build trivial.

---

## 1. Local development

### 1.1 Prerequisites

- **Bun** ≥ 1.3 (preferred) — or Node.js 20+ as a fallback runtime.
- **Supabase CLI** ≥ 2.x (for `supabase db push`, local emulation optional).
- A **Supabase project** (cloud or self-hosted). For Phase 1, a free-tier cloud project suffices.
- (Optional) **Redis** — leave `REDIS_URL` empty to use the in-memory fallback.

### 1.2 First-time setup

```bash
# 1. Clone and install
git clone <repo-url> supa-ai
cd supa-ai
bun install

# 2. Copy the env contract
cp .env.example .env

# 3. Generate secrets
openssl rand -base64 32  # → AUTH_SECRET
openssl rand -base64 32  # → JWT_SECRET
openssl rand -hex 32     # → ENCRYPTION_KEY (must be 32-byte hex)
openssl rand -hex 16     # → RATE_LIMIT_SECRET

# 4. Fill in .env with Supabase + AI + payment keys (see §3)

# 5. Apply migrations (Supabase CLI)
supabase db push

# 6. Run the dev server
bun run dev
```

The app boots at [http://localhost:3000](http://localhost:3000). Dev logs stream to `dev.log` and stdout.

### 1.3 Day-to-day commands

| Command | Purpose |
|---|---|
| `bun run dev` | Dev server with HMR (port 3000). |
| `bun run lint` | ESLint. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run build` | Production build into `.next/standalone/`. |
| `bun run start` | Run the standalone production server. |
| `supabase db push` | Apply new migrations. |
| `supabase db reset` | Drop + recreate + reapply all migrations (destructive). |

---

## 2. Environment matrix

Three environments, each with its own env source:

| Variable group | `development` | `staging` | `production` |
|---|---|---|---|
| `NEXT_PUBLIC_APP_ENVIRONMENT` | `development` | `staging` | `production` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://staging.supa-ai.app` | `https://supa-ai.app` |
| Supabase URL + keys | Local project | Staging project | Production project |
| Redis URL | *(empty — in-memory fallback)* | Staging Redis | Production Redis (required) |
| `ENCRYPTION_KEY` | Local hex key | Staging hex key | Production hex key (rotate yearly) |
| AI provider keys | Sandbox / test keys | Test keys | Production keys |
| Stripe | Test mode (`sk_test_…`) | Test mode | Live mode (`sk_live_…`) |
| Paystack | Test key | Test key | Live key |
| Flutterwave | Test key | Test key | Live key |

### 2.1 Environment-specific rules

- **Production refuses to start without Redis.** `src/lib/config/env.ts` will throw `ConfigurationError` if `env.app.isProd && !env.redis.enabled`. This is a fail-safe against accidentally running prod open-loop on rate limits.
- **Stripe / Paystack / Flutterwave live keys** are only ever present in the production secret store. They are never in `.env` on a developer laptop.
- **`SUPABASE_SERVICE_ROLE_KEY`** is the most dangerous secret in the system — it bypasses RLS. It lives only in the platform secret store (GitHub Actions secret / Vercel env var / Render secret). It is never logged, never echoed, never committed.

---

## 3. Supabase project setup

### 3.1 Create the project

1. Sign in to [supabase.com](https://supabase.com).
2. **New project** → pick a name, region (close to your users), strong DB password.
3. Wait for provisioning (~2 min).
4. From **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose)

### 3.2 Run migrations

```bash
# Option A: Supabase CLI (recommended)
supabase link --project-ref <project-ref>
supabase db push            # applies all supabase/migrations/*.sql

# Option B: Dashboard SQL editor
# Copy the contents of supabase/migrations/0001_init.sql into the SQL editor and run.
```

### 3.3 Configure auth providers

In the Supabase dashboard → **Authentication → Providers**:

- **Email:** enable, set confirmation template.
- **Google:** create OAuth credentials in Google Cloud Console; set redirect URL to `https://<project>.supabase.co/auth/v1/callback`.
- **GitHub:** create OAuth app; same redirect URL.
- **Magic link:** enable if desired.

Set the **Site URL** to your app's `NEXT_PUBLIC_APP_URL` and add `http://localhost:3000` to **Redirect URLs** for local dev.

### 3.4 Create storage buckets

In **Storage**, create three buckets:

| Bucket | Public? | MIME allowlist | Max size |
|---|---|---|---|
| `avatars` | Yes (public read) | `image/png, image/jpeg, image/webp, image/gif` | 2 MB |
| `uploads` | No (signed URLs only) | `application/pdf, text/plain, text/markdown, image/*, application/vnd.openxmlformats-*` | 25 MB |
| `ai-assets` | No (signed URLs only) | `image/png, image/jpeg, image/webp` | 50 MB |

RLS policies for the buckets are applied via `supabase/migrations/0001_init.sql` (see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) §3).

---

## 4. Redis provisioning

### 4.1 When you need Redis

| Environment | Redis required? |
|---|---|
| Local dev | **No** — in-memory fallback. |
| CI | **No** — in-memory fallback. |
| Staging | **Recommended** (so staging mirrors prod). |
| Production | **Yes** — process refuses to start without it. |

### 4.2 Providers

Any Redis-compatible service works: Upstash, Redis Cloud, AWS ElastiCache, GCP Memorystore, Render Redis, Aiven. Set:

```env
REDIS_URL="rediss://default:<password>@<host>:<port>"  # rediss:// = TLS
REDIS_TOKEN="<password-if-using-upstash-rest>"          # optional, only for REST-based clients
```

`src/lib/redis/` (🚧) uses `ioredis`, which speaks the Redis protocol natively — `REDIS_TOKEN` is unused unless we switch to Upstash REST (planned, only if we move to edge runtimes).

### 4.3 Connection hardening

- TLS enforced (`rediss://`).
- Connection pool: max 10, retry strategy: exponential backoff capped at 1s.
- Healthcheck ping every 30s; on failure, log + degrade rate-limited endpoints with `429` (fail-closed per [`SECURITY.md`](SECURITY.md) §7.2).

---

## 5. Payment provider setup

### 5.1 Stripe

1. Create a Stripe account → [dashboard.stripe.com](https://dashboard.stripe.com).
2. **Developers → API keys:** copy `Secret key` → `STRIPE_SECRET_KEY`; `Publishable key` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. **Developers → Webhooks → Add endpoint:**
   - URL: `https://<env-app-url>/api/billing/webhook/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   - Copy the `Signing secret` (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. **Products + Prices:** create one product per tier (`pro`, `team`, `enterprise`) with monthly + yearly prices. The price IDs are stored in `src/lib/constants/billing.ts` (planned).

### 5.2 Paystack

1. Create a Paystack account → [dashboard.paystack.com](https://dashboard.paystack.com).
2. **Settings → API Keys → Test/Live tab:** copy `Secret key` → `PAYSTACK_SECRET_KEY`; `Public key` → `PAYSTACK_PUBLIC_KEY`.
3. **Settings → API Keys → Webhooks:** add a webhook for `https://<env-app-url>/api/billing/webhook/paystack`; copy the `Secret hash` → `PAYSTACK_WEBHOOK_SECRET`.

### 5.3 Flutterwave

1. Create a Flutterwave account → [dashboard.flutterwave.com](https://dashboard.flutterwave.com).
2. **Settings → API Settings:** copy `Secret key` → `FLUTTERWAVE_SECRET_KEY`; `Public key` → `FLUTTERWAVE_PUBLIC_KEY`.
3. **Settings → Webhooks:** add `https://<env-app-url>/api/billing/webhook/flutterwave`; copy the `Secret hash` → `FLUTTERWAVE_WEBHOOK_SECRET`.

> All three providers expose a **test mode**. Use test keys for `development` and `staging`; switch to live keys only for `production`.

---

## 6. Docker build

The `Dockerfile` (planned) is a multi-stage build leveraging Next.js's `output: "standalone"`.

### 6.1 Intended `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- 1. deps ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock* ./
RUN npm install -g bun && bun install --frozen-lockfile

# ---- 2. builder ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g bun
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---- 3. runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Copy standalone output (Next.js produced this in builder)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

### 6.2 Build & run

```bash
docker build -t supa-ai:0.1.0 .
docker run --rm -p 3000:3000 \
  --env-file .env.production \
  --name supa-ai \
  supa-ai:0.1.0
```

### 6.3 Image hardening

- Runs as non-root user `nextjs` (UID 1001).
- Alpine base minimizes CVE surface.
- Healthcheck against `/api/health` (see [`API_SPECIFICATION.md`](API_SPECIFICATION.md) §6.4).
- No source code in the final image — only the standalone output + static assets + public.

---

## 7. GitHub Actions CI/CD

The workflow (planned at `.github/workflows/ci.yml`) runs on every PR and on `main`/`staging`/`production` branches.

### 7.1 Intended pipeline

```yaml
name: CI
on:
  push: { branches: [main, staging, production] }
  pull_request: { branches: [main] }

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run build
      - uses: actions/upload-artifact@v4
        with:
          name: standalone-build
          path: .next/standalone

  deploy-staging:
    needs: verify
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      # Vercel CLI deploy for staging
      - run: vercel deploy --prebuilt --token ${{ secrets.VERCEL_TOKEN }} --yes

  deploy-production:
    needs: verify
    if: github.ref == 'refs/heads/production'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: vercel deploy --prod --prebuilt --token ${{ secrets.VERCEL_TOKEN }} --yes
```

### 7.2 Required GitHub secrets

| Secret | Used for |
|---|---|
| `VERCEL_TOKEN` | Vercel CLI deploy. |
| `RENDER_DEPLOY_HOOK_URL` | (Alternative) Render webhook to trigger a deploy. |
| `SUPABASE_ACCESS_TOKEN` | Run migrations as a step (planned). |

---

## 8. Vercel deployment

Supa AI deploys cleanly to Vercel — it's a Next.js 16 app with no exotic runtime needs.

### 8.1 Setup

1. **Import the repo** at [vercel.com/new](https://vercel.com/new).
2. **Framework preset:** Next.js.
3. **Build command:** `bun run build` (Vercel auto-detects Bun if `bun.lock` is present).
4. **Output directory:** leave default (Vercel reads `next.config.ts`).
5. **Environment variables** — paste every value from `.env.example` for the target environment. Mark `NEXT_PUBLIC_*` accordingly.
6. **Deploy.**

### 8.2 Webhook routing

- Stripe / Paystack / Flutterwave webhooks must point at the Vercel-deployed URL (`https://<project>.vercel.app/api/billing/webhook/<provider>`).
- Use a custom domain (`https://supa-ai.app`) for production; Vercel handles the cert.

### 8.3 Function timeouts

Vercel Hobby tier caps function runtime at 10s. Streaming AI (`/api/ai/chat/stream`) needs longer-lived responses — use Vercel **Pro/Enterprise** (60s/300s) or self-host on Render/Docker for full control. Document this constraint in [`API_SPECIFICATION.md`](API_SPECIFICATION.md) §6.2 if relevant.

---

## 9. Render deployment

Render is the recommended path for self-hosted production (long-running streaming connections, no function-timeout cap).

### 9.1 Setup

1. **New → Web Service** → connect the repo.
2. **Runtime:** Docker (Render reads the `Dockerfile`).
3. **Docker command:** Render runs `docker build` then `docker run` with the env vars you set in the dashboard.
4. **Health check path:** `/api/health` (Render pings this; on 3 consecutive failures it restarts the instance).
5. **Instance size:** start at 2 GB RAM / 1 vCPU; scale horizontally behind Render's load balancer as traffic grows.
6. **Env vars:** paste every value from `.env.example` for production.
7. **Custom domain:** add `supa-ai.app` (Render provisions Let's Encrypt cert).

### 9.2 Render Redis

Provision a Render Redis instance in the same region; copy its internal URL into `REDIS_URL`. The internal hostname avoids egress charges and TLS overhead.

---

## 10. Pre-deploy checklist

Run this checklist before every production deploy.

### 10.1 Code

- [ ] `bun run lint` passes on `main`.
- [ ] `bun run typecheck` passes on `main`.
- [ ] `bun run build` completes with no warnings beyond known ones.
- [ ] No `console.log` left in production paths (use the structured `logger`).
- [ ] No `"TODO"` / `"FIXME"` on touched files.
- [ ] CHANGELOG entry added under `[Unreleased]` (or the target version).

### 10.2 Database

- [ ] All new migrations applied to staging and verified.
- [ ] `supabase db push` is idempotent against staging (no drift).
- [ ] RLS policies reviewed for every new table.
- [ ] Storage bucket policies reviewed for every new bucket.

### 10.3 Secrets

- [ ] All env vars in `.env.example` have corresponding values in the production secret store.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set **only** in production secret store, never in CI logs.
- [ ] `ENCRYPTION_KEY` is 32-byte hex and unchanged from the last deploy (rotating it requires a migration to re-encrypt existing ciphertext).
- [ ] `STRIPE_WEBHOOK_SECRET` / `PAYSTACK_WEBHOOK_SECRET` / `FLUTTERWAVE_WEBHOOK_SECRET` match the live webhook endpoints.

### 10.4 Providers

- [ ] Stripe / Paystack / Flutterwave are in **live mode** for production keys.
- [ ] Webhook endpoints reachable at `https://<prod-domain>/api/billing/webhook/<provider>` (test with a manual event).
- [ ] AI provider keys are valid (test with a single `chat` call).

### 10.5 Infra

- [ ] Redis URL set (production will refuse to boot otherwise).
- [ ] Docker image built locally and ran smoke (`docker run -p 3000:3000 …` + `curl /api/health`).
- [ ] Healthcheck endpoint responds `200` with `status: "ok"`.
- [ ] Render/Vercel instance size adequate (≥ 2 GB RAM).
- [ ] Custom domain + TLS certificate provisioned.

### 10.6 Observability

- [ ] Structured logs are reaching the log aggregator (Render logs / Vercel logs).
- [ ] Sentry DSN configured (planned, Phase 2).
- [ ] Uptime monitor on `https://<prod-domain>/api/health` (UptimeRobot, BetterUptime, or Pingdom).
- [ ] Stripe event delivery monitor (Stripe dashboard → Webhooks → check recent events for non-2xx responses).

---

## 11. Rollback

### 11.1 Application

- **Vercel:** "Instant Rollback" button in the dashboard → previous deployment goes live immediately.
- **Render:** redeploy the previous Docker image tag (`supa-ai:0.1.0-rc.N`); Render keeps the last N images.
- **Docker (self-hosted):** `docker stop supa-ai && docker run … supa-ai:<previous-tag>`.

### 11.2 Database

- **Migrations are forward-only.** Never restore a Postgres backup to "undo" a migration — you'll lose user data written since.
- If a migration is broken, ship a **forward-fix migration** (`NNNN_revert_xxx.sql`) rather than rolling back.

### 11.3 Secrets

If a secret is compromised:
1. Rotate in the secret store.
2. Trigger a redeploy so the new value is loaded.
3. See [`SECURITY.md`](SECURITY.md) §13 for the full incident checklist.

---

## 12. Cross-references

- For the env contract, see [`.env.example`](.env.example) and [`src/lib/config/env.ts`](src/lib/config/env.ts).
- For the database schema and migrations, see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).
- For security controls you must verify pre-deploy, see [`SECURITY.md`](SECURITY.md).
- For the API surface (including `/api/health`), see [`API_SPECIFICATION.md`](API_SPECIFICATION.md).
- For what's actually built vs planned, see [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md).
