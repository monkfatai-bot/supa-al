/**
 * Supa AI — Field-level cryptography.
 *
 * AES-256-GCM for reversible encryption (PII, API keys stored in DB).
 * SHA-256 for one-way hashing (lookup keys, fingerprints). Constant-time
 * comparison for secret equality checks.
 *
 * The encryption key comes from `env.security.encryptionKey` (64 hex chars =
 * 32 bytes). Output format: `iv:tag:ciphertext` (all hex, colon-delimited).
 *
 * Server-only — never expose the key to the client.
 *
 * @module @/lib/security/crypto
 */
import crypto from "node:crypto";

import { env } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV is the GCM standard.
const TAG_BYTES = 16;

function getKey(): Buffer {
  try {
    const key = Buffer.from(env.security.encryptionKey, "hex");
    if (key.length !== 32) {
      throw new ConfigurationError(
        "ENCRYPTION_KEY must decode to 32 bytes (64 hex chars).",
      );
    }
    return key;
  } catch (err) {
    if (err instanceof ConfigurationError) throw err;
    throw new ConfigurationError("Invalid ENCRYPTION_KEY encoding.", {
      cause: String(err),
    });
  }
}

/**
 * Encrypt a UTF-8 string. Output: `iv:tag:ciphertext` (all hex).
 * Returns null on empty input so callers can avoid encrypting blanks.
 */
export function encrypt(plaintext: string): string {
  if (plaintext === "") return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

/**
 * Decrypt a value produced by {@link encrypt}. Throws on tampering (GCM tag
 * mismatch) — callers should treat that as a security event.
 */
export function decrypt(payload: string): string {
  if (payload === "") return "";
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new ConfigurationError("Malformed ciphertext payload.");
  }
  const [ivHex, tagHex, ctHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex!, "hex");
  const tag = Buffer.from(tagHex!, "hex");
  const ct = Buffer.from(ctHex!, "hex");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new ConfigurationError("Malformed ciphertext payload (length).");
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** SHA-256 hex digest of an arbitrary string. */
export function hash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Constant-time comparison of a value against a known hash. Use for API keys,
 * webhook signatures, etc. Returns false on any parse error — never throws.
 */
export function compareHash(value: string, expectedHash: string): boolean {
  if (typeof value !== "string" || typeof expectedHash !== "string") {
    return false;
  }
  const actual = hash(value);
  if (actual.length !== expectedHash.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(actual, "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  } catch {
    // Different encodings / lengths — definitely not equal.
    return false;
  }
}

/**
 * Constant-time comparison of two equal-length strings (raw, not hashes).
 * Both inputs must have the same byte length or the function returns false.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Generate `nBytes` of cryptographically strong random bytes (hex). */
export function randomHex(nBytes: number): string {
  return crypto.randomBytes(nBytes).toString("hex");
}
