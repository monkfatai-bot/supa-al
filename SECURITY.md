# Security

> **Purpose.** This document is the security architecture for Supa AI. It covers authentication, Row-Level Security (RLS), secrets management, encryption, API-key hashing, JWT handling, rate limiting, webhook verification, CSP/security headers, input validation, and a threat model mapped to the OWASP Top 10. Every engineer working on a domain module, API route, or Server Action must read this before writing code that touches credentials, PII, or money.

> **Status.** Phase 1. The crypto module (`src/lib/security/`) and middleware (`src/lib/middleware/`) are 🚧 in progress; the policies below are normative.

---

## 1. Authentication model

### 1.1 Supabase Auth + JWT sessions

Supa AI does not implement authentication from scratch. It delegates to **Supabase Auth**, which issues a JWT (RS256-signed) on successful login and stores it in an `httpOnly`, `Secure`, `SameSite=Lax` cookie managed by [`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side).

| Property | Value |
|---|---|
| Token type | JWT (RS256) |
| Lifetime | 1 hour access token, 30-day refresh |
| Storage | `httpOnly` cookie (`sb-<ref>-auth-token`) |
| Transport | HTTPS only (`Secure` flag in prod) |
| Refresh | Automatic via `@supabase/ssr` middleware on every request |
| Supported providers | Email/password, magic link, Google, GitHub, (more added per phase) |
| MFA | TOTP (planned, Phase 6 enterprise) |

### 1.2 Three Supabase clients

| Client | When to use | Auth | RLS |
|---|---|---|---|
| **Browser** (`src/lib/supabase/browser.ts`, 🚧) | Client components, `<Client>` hooks | User's cookie session | **Enforced** |
| **Server** (`src/lib/supabase/server.ts`, 🚧) | Server Components, Route Handlers, Server Actions | Reads cookie from request | **Enforced** |
| **Admin** (`src/lib/supabase/admin.ts`, 🚧) | Trusted back-office only: webhook handlers, migrations, quota recalcs | Service-role key (no user) | **Bypassed** |

> **Hard rule.** The admin client must never be imported by code that runs in a request handler touched by user input. It is reserved for trusted back-office paths: webhook ingestion (post-signature-verify), cron jobs, and one-off ops scripts. Every call site is code-reviewed.

### 1.3 Session helpers

```ts
// src/lib/auth/index.ts (planned)
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/config";
import { AuthenticationError } from "@/lib/errors";

export async function getSession() {
  const supabase = createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: () => cookies(),
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getSession();
  if (!user) throw new AuthenticationError();
  return user;
}

export async function requireOrgRole(orgId: string, role: "owner" | "admin" | "member") {
  // Checks organization_members for the user + role; throws AuthorizationError.
}
```

---

## 2. Row-Level Security (RLS)

### 2.1 Default-deny

Every table in `public` has RLS enabled. The default posture is **deny** — a query without a matching `using` policy returns no rows. This means:

- A bug in application code that forgets to filter by `user_id` cannot leak data — Postgres itself refuses to return the row.
- The admin client (service-role key) is the only path that bypasses RLS, and it's gated to back-office code.

### 2.2 Policy patterns

Supa AI uses three policy templates:

**Self-scoped (users, api_keys, files for solo users):**
```sql
create policy "<table>_select_owner" on <table>
  for select using (auth.uid() = user_id);
```

**Org-scoped (organizations, organization_members, ai_conversations, files for orgs):**
```sql
create policy "<table>_select_member" on <table>
  for select using (
    exists (
      select 1 from organization_members m
      where m.org_id = <table>.org_id
        and m.user_id = auth.uid()
    )
  );
```

**Server-write-only (subscriptions, usage_records):**
```sql
create policy "<table>_select_owner" on <table>
  for select using (user_id = auth.uid() or <org member check>);
-- No INSERT / UPDATE / DELETE policies → denied from client.
-- Writes happen via the admin client in webhook handlers and AI facade.
```

### 2.3 The full policy table

See [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) §2 for every table's RLS policies.

---

## 3. Secrets management

### 3.1 Env validation

Every secret enters the runtime exclusively through `process.env` and is validated by [`src/lib/config/env.ts`](src/lib/config/env.ts) at boot. Unknown variables are rejected; missing required variables throw `ConfigurationError` and the process exits non-zero.

| Secret | Validation rule |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `z.string().min(1)` |
| `AUTH_SECRET` | `z.string().min(16)` |
| `JWT_SECRET` | `z.string().min(16)` |
| `ENCRYPTION_KEY` | `z.string().regex(/^[0-9a-fA-F]{64}$/)` (32-byte hex) |
| `RATE_LIMIT_SECRET` | `z.string().min(8)` (used as pepper) |
| `<PROVIDER>_API_KEY` | `z.string().default("")` (allows missing; AI routes that need them fail at runtime with `AIProviderError`) |

### 3.2 No secrets in client bundles

- Any variable prefixed with `NEXT_PUBLIC_` is inlined into client bundles. **Only non-secret public values** (app name, URL, environment, Supabase URL + anon key, Stripe publishable key) carry this prefix.
- Every other secret stays server-side. The `"server-only"` import in `src/lib/security/`, `src/lib/supabase/admin.ts`, `src/lib/billing/providers/*.ts`, and `src/lib/ai/providers/*.ts` causes the build to fail if any of these modules are accidentally imported from a client component.

### 3.3 `.env` discipline

- `.env.example` is committed — it is the contract.
- `.env` is git-ignored.
- `.env.local` overrides `.env` and is git-ignored.
- CI/CD injects secrets via the platform's secret store (GitHub Actions secrets, Vercel env vars, Render env vars). Never echo secrets in logs.

---

## 4. Encryption

### 4.1 Field-level encryption (AES-256-GCM)

`src/lib/security/crypto.ts` (🚧) provides symmetric authenticated encryption for sensitive fields at rest.

```ts
// Intended API:
import { encryptField, decryptField } from "@/lib/security/crypto";

const ciphertext = encryptField("user-provided-secret");
//  → { iv: string (b64), ciphertext: string (b64), tag: string (b64) }

const plaintext = decryptField(ciphertext);
//  → "user-provided-secret"
```

| Property | Value |
|---|---|
| Algorithm | AES-256-GCM (`node:crypto.createCipheriv("aes-256-gcm", …)`) |
| Key | `env.security.encryptionKey` (32 bytes, hex-encoded) |
| IV | 12-byte random per encryption |
| Auth tag | 16 bytes, stored alongside ciphertext |
| Output | `{ iv, ciphertext, tag }` base64-encoded |

**Fields encrypted at rest:**
- `api_keys.encrypted_key` — for "show once" recovery of the raw API key (planned; can be dropped if not needed).
- Future PII fields (Phase 4+ document AI may store user document text encrypted).

### 4.2 Hashing

- **Passwords:** Supabase Auth handles hashing (bcrypt). Supa AI never sees the plaintext password.
- **API keys:** SHA-256 with a server-side pepper (see §5).
- **File checksums:** SHA-256 of file contents, stored in `files.checksum` for integrity verification.

---

## 5. API key hashing

Long-lived API keys (`api_keys` table) are never stored in plaintext. The scheme:

```
raw_key = "supa_" + 32 bytes base64url(random)        # 41 chars, shown to user once
key_hash = sha256( RATE_LIMIT_SECRET + ":" + raw_key ) # 64-char hex, stored in api_keys.key_hash
encrypted_key = AES-256-GCM(raw_key)                   # stored in api_keys.encrypted_key (for recovery)
key_prefix = raw_key.slice(0, 12)                      # stored in api_keys.key_prefix for UI display
```

### Verification flow

```
1. Client sends Authorization: Bearer supa_xxxxxxxx...
2. Middleware extracts the raw key, computes sha256(pepper + ":" + raw_key).
3. Queries: select * from api_keys where key_hash = $1 and revoked_at is null.
4. If found + not expired: update last_used_at, attach user_id/org_id to request.
5. Else: respond 401 AUTHENTICATION_ERROR.
```

### Why a pepper?

A pepper (server-side secret mixed into the hash) defeats rainbow tables even if the database is exfiltrated. The pepper is `env.security.rateLimitSecret`, which never leaves the server.

### Why SHA-256 and not bcrypt/argon2?

API keys are high-entropy (32 bytes of CSPRNG output), so a fast hash is acceptable — the entropy defeats brute force, not the hash slowness. Bcrypt/argon2 are for low-entropy inputs (human passwords). Using them for API keys would add latency to every authenticated request without security benefit.

---

## 6. JWT signing

Two distinct JWT uses:

| Use case | Signer | Secret | Lifetime |
|---|---|---|---|
| User sessions | **Supabase Auth** (RS256) | Supabase's keypair | 1h access, 30d refresh |
| Service-to-service tokens | **Supa AI** (`src/lib/security/jwt.ts`, 🚧) | `env.security.jwtSecret` (HS256) | ≤ 5 min |

Supa AI-issued service tokens are used for:
- Internal calls between Next.js server workers and Edge Functions (planned).
- Short-lived delegation tokens for marketplace creators to call Supa AI on behalf of a user (Phase 5).

The signer:

```ts
// Intended API:
import { signJwt, verifyJwt } from "@/lib/security/jwt";

const token = signJwt({ sub: userId, scope: ["chat"] }, { expiresIn: "5m" });
const payload = verifyJwt(token); // throws AuthenticationError on invalid/expired
```

---

## 7. Rate limiting

### 7.1 Strategy

- **Two scopes per request:** per-IP (anti-abuse) and per-user (quota). The stricter of the two wins.
- **Sliding window:** exact sliding window via Redis `ZSET` (`ZREMRANGEBYSCORE` + `ZADD` + `ZCARD`). In dev (no Redis), an in-memory `Map` with timestamp pruning approximates the same semantics.
- **Per-route presets:** see [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §7.

### 7.2 Fail-closed in production

- `env.app.isProd` + `!env.redis.enabled` → process refuses to start. Rate-limited endpoints cannot run open in production.
- `env.app.isDev` + `!env.redis.enabled` → in-memory fallback is used.
- Redis unreachable at runtime → the limiter returns `429 RATE_LIMIT_ERROR` with `Retry-After: 60` for the affected window. Better to deny than to allow a burst.

### 7.3 Headers

See [`API_SPECIFICATION.md`](API_SPECIFICATION.md) §4 for the rate-limit header contract.

---

## 8. Webhook signature verification

Each payment provider signs its webhook payloads. Supa AI verifies the signature **before** any business logic runs, using a constant-time comparison.

### 8.1 Stripe

- Algorithm: HMAC SHA-256 over `<timestamp>.<raw_body>`.
- Header: `Stripe-Signature: t=<ts>,v1=<sig>[,v0=<...>]`.
- Secret: `env.payments.stripe.webhookSecret` (`whsec_…`).
- Library: `stripe.webhooks.constructEvent(rawBody, signature, secret)` from the `stripe` SDK — handles timestamp tolerance (5 min) and constant-time comparison internally.

### 8.2 Paystack

- Algorithm: HMAC SHA-512 over the raw body.
- Header: `X-Paystack-Signature`.
- Secret: `env.payments.paystack.webhookSecret`.
- Verification: `crypto.createHmac("sha512", secret).update(rawBody).digest("hex") === header` using `crypto.timingSafeEqual`.

### 8.3 Flutterwave

- Algorithm: HMAC SHA-256 over the raw body.
- Header: `Verif-Hash`.
- Secret: `env.payments.flutterwave.webhookSecret`.
- Verification: same constant-time compare as Paystack.

### 8.4 Raw body requirement

Webhook routes must read the **raw body** (not the parsed JSON), because the signature is computed over the exact bytes Supabase/Stripe sent. Next.js Route Handlers expose this via `await request.text()`.

---

## 9. Content Security Policy + security headers

Supa AI sets the following headers via `next.config.ts` (or a middleware) on every response:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.stripe.com; frame-ancestors 'none'; base-uri 'self'` | Prevents XSS data exfiltration; allows inline styles (Tailwind) + Stripe.js iframe. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS. |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing prevention. |
| `X-Frame-Options` | `DENY` | Clickjacking prevention (redundant with `frame-ancestors 'none'`). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disable unused browser features. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Process isolation. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Restrict cross-origin resource loads. |

> The `'unsafe-inline'` and `'unsafe-eval'` in `script-src` will be tightened to nonces once the build pipeline is finalized (planned, Phase 2).

---

## 10. Input validation

- **Every public boundary** — API route handlers, Server Actions, form submissions — validates input with **Zod** before any business logic.
- Schemas live in `src/lib/validation/` (🚧) and are reused across boundaries.
- On validation failure, throw `ValidationError` with `details: { field, issue }`.

```ts
// Example: src/app/api/ai/chat/route.ts (planned)
import { z } from "zod";
import { ValidationError } from "@/lib/errors";

const chatSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1).max(20_000),
  })).min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid chat request.", parsed.error.flatten());
  }
  // ...
}
```

- **File uploads** are validated for MIME type and size before they reach Supabase Storage (see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) §3).
- **Query parameters** (pagination, filters) are validated with `PaginationSchema` and feature-specific schemas.

---

## 11. The `internal` flag — never leak internals

Every `AppError` has an `internal: boolean` property (default `true`).

- `internal: true` → the `message` and `details` are kept for the structured log only; the API response returns `"An internal error occurred."`.
- `internal: false` → the `message` and `details` are safe to expose to the client.

This is enforced in the route-handler error middleware:

```ts
// src/lib/middleware/with-error-handling.ts (planned)
function toResponse(err: AppError, requestId: string) {
  const safe = err.internal
    ? { code: err.code, message: "An internal error occurred." }
    : { code: err.code, message: err.message, details: err.details };
  return Response.json(
    { ok: false, error: safe, requestId },
    { status: err.statusCode },
  );
}
```

The rule of thumb: **if a developer would write the message in a stack trace, it must be `internal: true`**. User-facing messages are short, action-oriented, and free of internal identifiers.

---

## 12. Threat model (OWASP Top 10 mapping)

| OWASP risk | Supa AI control | Reference |
|---|---|---|
| **A01 — Broken Access Control** | RLS default-deny on every table; org-scoped policies; `requireOrgRole()` helper; admin client confined to back-office. | §2 |
| **A02 — Cryptographic Failures** | AES-256-GCM field-level encryption; SHA-256 + pepper for API keys; HSTS; no plaintext secrets in DB or logs; `ENCRYPTION_KEY` enforced as 32-byte hex. | §4, §5 |
| **A03 — Injection** | Parameterized queries (Supabase client uses PostgREST, never raw SQL strings); Zod validation at every input boundary; PostgREST forbids SQL injection by construction. | §10 |
| **A04 — Insecure Design** | Layered architecture with explicit boundaries; threat-modeling each new domain module; secure-by-default conventions in [`PROJECT_SPECIFICATION.md`](PROJECT_SPECIFICATION.md). | All sections |
| **A05 — Security Misconfiguration** | Env validation at boot fails fast on misconfig; `output: "standalone"` for deterministic builds; CSP + HSTS + X-Frame-Options headers; no default credentials. | §3, §9 |
| **A06 — Vulnerable & Outdated Components** | `bun install` pins versions; Dependabot/Renovate planned (Phase 2); `bun audit` in CI. | [`DEPLOYMENT.md`](DEPLOYMENT.md) §"CI/CD" |
| **A07 — Identification & Auth Failures** | Supabase Auth (RS256 JWT, httpOnly cookie, SameSite=Lax); MFA planned (Phase 6); rate-limited auth endpoints (10/min/IP). | §1, §7 |
| **A08 — Software & Data Integrity Failures** | Webhook signature verification for all 3 payment providers; signed Docker images planned (Phase 2); commit signing recommended. | §8 |
| **A09 — Security Logging & Monitoring Failures** | Structured logger with request IDs; `auth.*`, `billing.*`, `ai.*` events logged at info+; security events logged at warn+; Sentry sink planned (Phase 2). | [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §2.1 |
| **A10 — Server-Side Request Forgery (SSRF)** | No outbound user-controlled URL fetching in Phase 1. AI provider URLs are fixed in env (not user-configurable). Image fetch (Phase 3) will run through an allowlist-based fetcher. | §3.1 |

---

## 13. Incident response checklist

When a security incident is suspected:

1. **Rotate** the affected secret(s) in the secret store; redeploy.
2. **Revoke** compromised API keys via `update api_keys set revoked_at = now() where id = $1`.
3. **Force-logout** affected users via `supabase.auth.signOut({ scope: "global" })` (admin API).
4. **Audit** logs around the incident window using `requestId` correlation.
5. **Notify** affected users within 72 hours per GDPR-style obligations.
6. **Postmortem** in `docs/incidents/<date>-<slug>.md` covering root cause, blast radius, and prevention.

---

## 14. Cross-references

- For the env contract, see [`.env.example`](.env.example) and [`src/lib/config/env.ts`](src/lib/config/env.ts).
- For the database tables and their RLS policies, see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).
- For the rate-limit headers and API envelope, see [`API_SPECIFICATION.md`](API_SPECIFICATION.md).
- For the error hierarchy and the `internal` flag, see [`src/lib/errors/index.ts`](src/lib/errors/index.ts) and [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §8.
