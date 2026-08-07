/**
 * Supa AI — API key generation + hashing.
 *
 * API keys issued by the platform (for programmatic access). They are shown
 * to the user exactly once at creation; we store only a peppered SHA-256 hash.
 * Verification is constant-time.
 *
 * This is NOT for user password auth — Supabase Auth owns that. Use this for
 * service/API keys issued from the dashboard.
 *
 * Server-only.
 *
 * @module @/lib/security/password
 */
import crypto from "node:crypto";

import { env } from "@/lib/config/env";
import { compareHash, hash, randomHex } from "./crypto";

/** Public prefix that identifies a key's environment + resource type. */
export interface ApiKeyParts {
  /**
   * The full plaintext key. Returned to the caller ONCE; never persisted.
   * Format: `{prefix}_{secret}` e.g. `sk_live_abcd1234...`.
   */
  key: string;
  /** SHA-256(key + pepper). Store this in the DB. */
  hash: string;
  /** Visible prefix (first ~12 chars) for display in the dashboard. */
  prefix: string;
  /** Random 16-byte secret portion (hex). */
  secret: string;
}

const KEY_PREFIX = "sk";
const ENV_SUFFIX_LIVE = "live";
const ENV_SUFFIX_TEST = "test";

function environmentSuffix(): string {
  return env.app.environment === "production" ? ENV_SUFFIX_LIVE : ENV_SUFFIX_TEST;
}

/**
 * Generate a new API key. Returns the plaintext (shown once), the hash (to
 * persist), and a visible prefix for display.
 */
export function generateApiKey(): ApiKeyParts {
  const secret = randomHex(24); // 192 bits of entropy.
  const suffix = environmentSuffix();
  const key = `${KEY_PREFIX}_${suffix}_${secret}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, 12),
    secret,
  };
}

/**
 * Peppered hash of an API key for storage. The pepper comes from
 * `env.security.rateLimitSecret` (a server-only value) so a DB leak alone
 * cannot be used to forge keys.
 */
export function hashApiKey(key: string): string {
  const peppered = `${key}:${env.security.rateLimitSecret}`;
  return hash(peppered);
}

/**
 * Constant-time verification of an API key against its stored hash.
 * Returns false (never throws) on any mismatch.
 */
export function verifyApiKey(key: string, storedHash: string): boolean {
  if (!key || !storedHash) return false;
  return compareHash(`${key}:${env.security.rateLimitSecret}`, storedHash);
}

/**
 * Extract the visible prefix from a full key (e.g. `sk_live_abcd1234...`).
 * Useful for showing a "last used" badge without revealing the secret.
 */
export function keyPrefix(key: string): string {
  return key.slice(0, 12);
}

/**
 * Quick validity check that doesn't touch the DB — used to fail fast on
 * obviously malformed inputs before doing a lookup.
 */
export function looksLikeApiKey(value: string): boolean {
  return /^sk_(live|test)_[0-9a-f]{16,}$/.test(value);
}

/**
 * Generate a cryptographically-strong opaque token for use as a CSRF state,
 * session id, or one-shot nonce. Returns `nBytes` hex chars (default 32 bytes
 * = 64 hex chars).
 */
export function generateToken(nBytes = 32): string {
  return crypto.randomBytes(nBytes).toString("hex");
}
