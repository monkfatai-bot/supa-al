# API Specification

> **Purpose.** This document is the contract for every HTTP endpoint and Server Action exposed by Supa AI. It defines URL conventions, the standard response envelope, auth model, rate-limit headers, CORS, and the Phase 1 endpoint inventory with method, request body, response shape, and error codes. Frontend clients (and Phase 5+ marketplace integrators) treat this document as the source of truth.

> **Status.** Phase 1. Auth routes are 🚧 in progress; AI and billing endpoints are 📋 planned. The envelope, headers, and conventions below are normative.

---

## 1. URL conventions

All HTTP endpoints live under `/api/<domain>/<action>`:

| Domain | Path prefix | Example |
|---|---|---|
| Auth | `/api/auth/*` | `/api/auth/me`, `/api/auth/signout` |
| AI | `/api/ai/*` | `/api/ai/chat`, `/api/ai/chat/stream` |
| Billing | `/api/billing/*` | `/api/billing/checkout`, `/api/billing/webhook/stripe` |
| Files | `/api/files/*` | `/api/files/upload` (planned) |
| Health | `/api/health` | Readiness probe |
| Organizations | `/api/organizations/*` | (planned, Phase 2+) |

Server Actions are colocated with their feature route (e.g., `src/app/(dashboard)/settings/api-keys/actions.ts`) and use the `"use server"` directive. They are not part of the public REST surface and follow the same envelope when returning data.

---

## 2. Standard response envelope

Every JSON response (success **and** error) uses the `ApiResponse<T>` envelope. Streaming endpoints (`/api/ai/chat/stream`) bypass the envelope for the streaming body but return the envelope on terminal error.

### Type contract

```ts
// src/types/api.ts (planned)
export interface ApiResponse<T> {
  /** True on success, false on any error. */
  ok: boolean;
  /** The payload on success. Omitted on error. */
  data?: T;
  /** Normalized error object on failure. Omitted on success. */
  error?: {
    code: ErrorCode;        // stable string, e.g. "VALIDATION_ERROR"
    message: string;        // user-safe message (internals stripped)
    details?: Record<string, unknown>;
  };
  /** Request correlation ID. Echoed in `X-Request-Id` header. */
  requestId: string;
}
```

`ErrorCode` is the union defined in [`src/lib/errors/index.ts`](src/lib/errors/index.ts): `CONFIGURATION_ERROR | VALIDATION_ERROR | AUTHENTICATION_ERROR | AUTHORIZATION_ERROR | NOT_FOUND_ERROR | CONFLICT_ERROR | RATE_LIMIT_ERROR | PAYMENT_ERROR | AI_PROVIDER_ERROR | DATABASE_ERROR | STORAGE_ERROR | EXTERNAL_SERVICE_ERROR | INTERNAL_ERROR`.

### Success example

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_01HZX...

{
  "ok": true,
  "data": { "id": "conv_…" },
  "requestId": "req_01HZX..."
}
```

### Error example

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
X-Request-Id: req_01HZX...

{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "messages must be a non-empty array.",
    "details": { "field": "messages" }
  },
  "requestId": "req_01HZX..."
}
```

### Internal-error scrubbing

If the thrown `AppError.internal === true`, the response `message` is replaced with `"An internal error occurred."` and `details` is omitted. The original message + details survive in the structured log keyed by `requestId`. See [`SECURITY.md`](SECURITY.md) §"Error-internal flag".

---

## 3. Auth model

- **Session mechanism:** Supabase Auth issues a JWT stored in an `httpOnly` cookie managed by `@supabase/ssr`. The cookie is sent automatically by the browser.
- **Server-side reads:** `src/lib/auth/getSession()` (planned) reads the session from cookies in Server Components, Route Handlers, and Server Actions.
- **API-key auth (programmatic):** Long-lived keys issued via `/api/.../api-keys` (planned) are sent as `Authorization: Bearer supa_<key>`. The middleware looks up the key by hash, verifies it isn't revoked/expired, and synthesizes a session.
- **No CSRF token for GET** — GET endpoints are idempotent. **POST/PUT/DELETE over cookie auth** are protected by Next.js built-in CSRF protections (SameSite=Lax cookies + origin checks in middleware).

Routes marked **Auth: required** respond with `401 AUTHENTICATION_ERROR` if no session is present. Routes marked **Auth: optional** return anonymous-scoped data.

---

## 4. Rate-limit headers

Every rate-limited response includes:

| Header | Format | Always present? |
|---|---|---|
| `X-RateLimit-Limit` | integer (max requests in window) | Yes (on rate-limited routes) |
| `X-RateLimit-Remaining` | integer | Yes |
| `X-RateLimit-Reset` | epoch seconds when the window resets | Yes |
| `Retry-After` | integer seconds | Only on `429` responses |

When the limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1722781260
Retry-After: 42

{
  "ok": false,
  "error": {
    "code": "RATE_LIMIT_ERROR",
    "message": "Rate limit exceeded.",
    "details": { "retryAfter": 42 }
  },
  "requestId": "req_…"
}
```

See [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §7 for the limiter design and [`SECURITY.md`](SECURITY.md) §"Rate limiting" for the threat model.

---

## 5. CORS policy

- **Same-origin by default.** The Next.js app serves both the UI and the API; browsers see same-origin requests and don't need CORS preflight.
- **`/api/billing/webhook/<provider>`** routes opt out of CORS (provider servers POST directly; CORS irrelevant).
- **Programmatic API access via API keys** (planned, Phase 5+) will be served from a separate `api.supa.ai` origin with a configurable `Access-Control-Allow-Origin` allowlist driven by an env var.

Standard headers on cross-origin-aware routes:

```
Access-Control-Allow-Origin: <from allowlist, never *>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Request-Id
Access-Control-Max-Age: 600
```

---

## 6. Phase 1 endpoint inventory

### 6.1 Auth

#### `GET /api/auth/callback`

**Auth:** optional (Supabase redirects here with `code`).

Supabase Auth callback target. Exchanges the OAuth `code` for a session, sets the `httpOnly` session cookie via `@supabase/ssr`, then redirects to the `next` query param (default `/dashboard`).

| Param | In | Type | Required | Notes |
|---|---|---|---|---|
| `code` | query | string | yes | OAuth code from Supabase. |
| `next` | query | string | no | Redirect target after cookie set. Defaults to `/dashboard`. |

**Responses:**
- `302` → redirect to `next` on success.
- `400 VALIDATION_ERROR` — missing/invalid `code`.
- `500 INTERNAL_ERROR` — Supabase token exchange failed (logged).

---

#### `POST /api/auth/signout`

**Auth:** required.

Clears the Supabase session cookie and revokes the server-side session.

**Request body:** empty.

**Response (`200`):**
```json
{ "ok": true, "data": { "signedOut": true }, "requestId": "req_…" }
```

**Errors:** `401 AUTHENTICATION_ERROR` if no session; `500 INTERNAL_ERROR` on Supabase failure.

---

#### `GET /api/auth/me`

**Auth:** required.

Returns the current user's profile + active organization + subscription summary. Used by the dashboard shell on load.

**Response (`200`):**
```ts
type MeResponse = {
  user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
  activeOrg: { id: string; name: string; slug: string; role: "owner" | "admin" | "member" } | null;
  subscription: { tier: "free" | "pro" | "team" | "enterprise"; status: string } | null;
  features: { chat: boolean; imageGeneration: boolean; marketplace: boolean; businessTools: boolean };
};
```

**Errors:** `401 AUTHENTICATION_ERROR` if no session.

---

### 6.2 AI (planned — Phase 2)

#### `POST /api/ai/chat`

**Auth:** required. **Rate limit:** `ai.chat` preset (20 req/min/user).

Synchronous (non-streaming) chat completion. Use for short, single-shot completions; prefer `/api/ai/chat/stream` for conversational UX.

**Request body:**
```ts
type ChatRequest = {
  provider?: ProviderId;       // defaults to env.ai.defaultProvider
  model?: string;              // defaults to env.ai.defaultModel
  conversationId?: string;     // if omitted, a new conversation is created
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;        // 0–2, default per provider
  maxTokens?: number;
};
```

**Response (`200`):**
```ts
type ChatResponse = {
  conversationId: string;
  messageId: string;
  content: string;
  provider: ProviderId;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};
```

**Errors:**
- `400 VALIDATION_ERROR` — messages empty, provider unknown, model unsupported.
- `402 PAYMENT_ERROR` — usage exceeds the user's tier quota.
- `429 RATE_LIMIT_ERROR` — per-user rate limit hit.
- `502 AI_PROVIDER_ERROR` — upstream provider returned an error.

---

#### `POST /api/ai/chat/stream`

**Auth:** required. **Rate limit:** `ai.chat.stream` preset (10 req/min/user).

Server-Sent Events (SSE) streaming chat. The response `Content-Type` is `text/event-stream`; each event is `data: <json>\n\n`. The terminal event carries the aggregated `usage` payload.

**Request body:** same as `/api/ai/chat` (with `stream: true` implied).

**SSE event shapes:**
```ts
// Incremental token chunk
{ "type": "chunk", "conversationId": "…", "delta": "Hello" }

// Tool call (when supported by provider)
{ "type": "tool_call", "id": "…", "name": "…", "args": { … } }

// Final usage + termination
{ "type": "done", "messageId": "…", "usage": { "promptTokens": 12, "completionTokens": 34, "totalTokens": 46 } }

// Error mid-stream (terminal)
{ "type": "error", "error": { "code": "AI_PROVIDER_ERROR", "message": "Upstream timeout." } }
```

**Errors:** same as `/api/ai/chat`; rate-limit and validation errors are returned as the standard JSON envelope before the stream opens.

---

### 6.3 Billing (planned — Phase 2)

#### `POST /api/billing/checkout`

**Auth:** required. **Rate limit:** `billing.checkout` preset (10 req/min/user).

Creates a checkout session at the configured payment provider and returns the URL the client should redirect to.

**Request body:**
```ts
type CheckoutRequest = {
  provider?: "stripe" | "paystack" | "flutterwave"; // defaults to env.payments.defaultProvider
  tier: "pro" | "team" | "enterprise";
  orgId?: string;     // if subscribing an org rather than the user
  successUrl: string; // must be on env.app.url origin
  cancelUrl: string;
};
```

**Response (`200`):**
```ts
type CheckoutResponse = {
  provider: "stripe" | "paystack" | "flutterwave";
  sessionId: string;
  url: string;
};
```

**Errors:**
- `400 VALIDATION_ERROR` — invalid tier, success/cancel URL not on allowed origin.
- `402 PAYMENT_ERROR` — provider refused to create the session.
- `409 CONFLICT_ERROR` — user already has an active subscription of equal or higher tier.

---

#### `POST /api/billing/webhook/<provider>`

**Auth:** none (verified by signature). **Rate limit:** none.

Receives webhook events from Stripe / Paystack / Flutterwave. The route reads the raw body, verifies the signature using the provider's webhook secret, and dispatches the normalized event to `src/lib/billing/facade.ts`'s `handleWebhook()`.

| Path param | Provider | Signature header |
|---|---|---|
| `/api/billing/webhook/stripe` | Stripe | `Stripe-Signature` (HMAC SHA-256, `t=…,v1=…`) |
| `/api/billing/webhook/paystack` | Paystack | `X-Paystack-Signature` (HMAC SHA-512) |
| `/api/billing/webhook/flutterwave` | Flutterwave | `Verif-Hash` (HMAC SHA-256) |

**Request body:** the raw provider payload (varies by provider; never parsed by the route — that happens after verification in the billing facade).

**Response (`200`):**
```json
{ "ok": true, "data": { "received": true }, "requestId": "req_…" }
```

The route **always returns 200** for successfully-verified events to prevent provider retries; processing failures are logged and queued for retry (planned, Phase 2).

**Errors:**
- `400 VALIDATION_ERROR` — signature missing.
- `401 AUTHENTICATION_ERROR` — signature verification failed.

> See [`SECURITY.md`](SECURITY.md) §"Webhook signature verification" for the verification algorithm and timing-safe comparison rules.

---

### 6.4 Health

#### `GET /api/health`

**Auth:** none. **Rate limit:** none.

Lightweight readiness probe. Returns the app version, environment, and dependency reachability. Used by Docker healthchecks, load balancers, and uptime monitors.

**Response (`200`):**
```ts
type HealthResponse = {
  status: "ok" | "degraded";
  version: string;       // package.json version
  environment: "development" | "staging" | "production";
  timestamp: string;     // ISO 8601
  dependencies: {
    supabase: "ok" | "down";
    redis: "ok" | "down" | "skipped"; // skipped = in-memory fallback in use
  };
};
```

**Errors:** none — returns `503` with `status: "degraded"` when a critical dependency is unreachable.

---

## 7. Error matrix

The table below maps every `ErrorCode` to its default HTTP status and the routes that can produce it.

| Code | HTTP | Internal? | Produced by |
|---|---|---|---|
| `CONFIGURATION_ERROR` | 500 | yes | Boot only — process exits before serving requests. |
| `VALIDATION_ERROR` | 400 | no | All routes with a request body. |
| `AUTHENTICATION_ERROR` | 401 | no | Any `Auth: required` route; webhook signature failure. |
| `AUTHORIZATION_ERROR` | 403 | no | Org-scoped routes when user lacks role. |
| `NOT_FOUND_ERROR` | 404 | no | Resource lookup routes. |
| `CONFLICT_ERROR` | 409 | no | `/api/billing/checkout` (duplicate tier). |
| `RATE_LIMIT_ERROR` | 429 | no | All rate-limited routes. |
| `PAYMENT_ERROR` | 402 | no | `/api/billing/checkout`, `/api/ai/chat` (quota). |
| `AI_PROVIDER_ERROR` | 502 | no | `/api/ai/chat`, `/api/ai/chat/stream`. |
| `DATABASE_ERROR` | 500 | yes | Any route touching Supabase. |
| `STORAGE_ERROR` | 500 | yes | `/api/files/*` (planned). |
| `EXTERNAL_SERVICE_ERROR` | 502 | yes | Calls to non-AI external services. |
| `INTERNAL_ERROR` | 500 | yes | Fallback for unknown thrown values. |

---

## 8. Request ID propagation

Every request gets a unique `requestId` (UUID v7, time-ordered). The ID is:

1. Read from the `X-Request-Id` header if present and valid; otherwise generated.
2. Echoed back in the `X-Request-Id` response header.
3. Embedded in the `ApiResponse.requestId` field.
4. Added to the structured log context for every log line emitted by the request via `createRequestLogger({ requestId, userId })`.

This lets a single ID trace a request across the Next.js server, Supabase query logs, and provider upstream logs (when the provider accepts a request header — e.g., OpenAI's `OpenAI-Organization` analog).

---

## 9. Versioning

- Phase 1 endpoints are unversioned (no `/v1/` prefix).
- Breaking changes will be introduced under `/api/v2/*` with the old version maintained for a deprecation window of ≥ 90 days.
- Non-breaking changes (new optional fields, new endpoints) ship without a version bump.
- A `Sunset` header will be sent on deprecated endpoints 30 days before removal.

---

## 10. OpenAPI

An OpenAPI 3.1 spec will be generated from the route handlers (planned, Phase 2) and published at `/api/openapi.json`. This document remains the human-readable contract.

---

## 11. Cross-references

- For the envelope's error class hierarchy, see [`src/lib/errors/index.ts`](src/lib/errors/index.ts) and [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §8.
- For rate-limit design, see [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md) §7.
- For auth, webhook verification, and CSRF, see [`SECURITY.md`](SECURITY.md).
- For the database tables that these endpoints read/write, see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).
