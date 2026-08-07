/**
 * Supa AI — JWT signing/verification (HS256).
 *
 * Used for short-lived service tokens (email verification, password reset,
 * inter-service requests) — NOT for user session auth, which Supabase owns.
 *
 * Claims include `iss`, `aud`, `iat`, `exp` per JWT best practice. The
 * secret comes from `env.security.jwtSecret` (>= 16 chars).
 *
 * Server-only.
 *
 * @module @/lib/security/jwt
 */
import crypto from "node:crypto";

import { env } from "@/lib/config/env";
import { AuthenticationError, ConfigurationError } from "@/lib/errors";

const ALGO = "HS256";
const ISSUER = env.app.name;
const AUDIENCE = "supa-ai";
const DEFAULT_TTL_SEC = 60 * 15; // 15 minutes.

/** Standard JWT claims + arbitrary app payload. */
export interface JwtPayload {
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  sub?: string;
  jti?: string;
  [key: string]: unknown;
}

export interface SignJwtOptions {
  /** Time-to-live in seconds. Default 15m. */
  ttlSec?: number;
  /** Override issuer (default: app name). */
  issuer?: string;
  /** Override audience (default: "supa-ai"). */
  audience?: string;
  /** Subject (typically a user or org id). */
  subject?: string;
  /** Unique token id (for revocation). Auto-generated when omitted. */
  jti?: string;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(data: string): string {
  const key = env.security.jwtSecret;
  if (!key || key.length < 16) {
    throw new ConfigurationError("JWT_SECRET must be at least 16 characters.");
  }
  const sig = crypto.createHmac("sha256", key).update(data).digest();
  return b64url(sig);
}

/**
 * Sign a payload. Returns a compact JWT string.
 */
export function signJwt(
  payload: JwtPayload,
  opts: SignJwtOptions = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: ALGO, typ: "JWT" };
  const body: JwtPayload = {
    iss: opts.issuer ?? ISSUER,
    aud: opts.audience ?? AUDIENCE,
    iat: now,
    exp: now + (opts.ttlSec ?? DEFAULT_TTL_SEC),
    jti: opts.jti ?? crypto.randomBytes(8).toString("hex"),
    ...payload,
  };
  if (opts.subject) body.sub = opts.subject;

  const headerB64 = b64url(JSON.stringify(header));
  const bodyB64 = b64url(JSON.stringify(body));
  const signingInput = `${headerB64}.${bodyB64}`;
  const sig = sign(signingInput);
  return `${signingInput}.${sig}`;
}

export interface VerifyJwtOptions {
  /** Verify the issuer matches this value (default: app name). */
  issuer?: string;
  /** Verify the audience matches this value (default: "supa-ai"). */
  audience?: string;
  /** Skip expiry check (use sparingly — e.g. one-shot refresh flows). */
  ignoreExpiration?: boolean;
}

/**
 * Verify a JWT's signature + standard claims. Throws {@link AuthenticationError}
 * on any failure (bad signature, expired, wrong issuer/audience).
 */
export function verifyJwt<T extends JwtPayload = JwtPayload>(
  token: string,
  opts: VerifyJwtOptions = {},
): T {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthenticationError("Malformed token.");
  }
  const [headerB64, bodyB64, sigB64] = parts;
  const signingInput = `${headerB64}.${bodyB64}`;
  const expectedSig = sign(signingInput);
  const actualSig = b64urlDecode(sigB64!).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Constant-time compare.
  const a = Buffer.from(expectedSig);
  const b = Buffer.from(actualSig, "base64");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AuthenticationError("Invalid token signature.");
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(bodyB64!).toString("utf8")) as JwtPayload;
  } catch {
    throw new AuthenticationError("Malformed token payload.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!opts.ignoreExpiration) {
    if (typeof payload.exp !== "number" || payload.exp <= now) {
      throw new AuthenticationError("Token has expired.");
    }
  }
  const expectedIss = opts.issuer ?? ISSUER;
  if (payload.iss && payload.iss !== expectedIss) {
    throw new AuthenticationError("Token issuer mismatch.");
  }
  const expectedAud = opts.audience ?? AUDIENCE;
  if (payload.aud && payload.aud !== expectedAud) {
    throw new AuthenticationError("Token audience mismatch.");
  }
  return payload as T;
}
