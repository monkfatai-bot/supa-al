/**
 * Supa AI — shared utilities.
 *
 * Re-exports the existing `cn` class-name helper from `@/lib/utils.ts`
 * (the original shadcn file) and adds a curated set of framework-agnostic
 * utilities used across the platform: formatting (dates, currency, bytes,
 * numbers), small collection helpers (chunk, groupBy, uniqueBy), string
 * helpers (slugify, truncate), JSON safety, id/hash helpers, and a
 * `retry` helper for transient failure recovery.
 *
 * Every utility is pure (no side effects on its inputs), never throws
 * silently (errors are surfaced via return values or thrown `AppError`s),
 * and is fully typed with no `any`.
 *
 * @module @/lib/utils
 */

export { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Options accepted by {@link formatDate}. */
export interface FormatDateOptions {
  /** BCP-47 locale tag. Default `en-US`. */
  locale?: string;
  /** Predefined date style. Default `medium`. */
  dateStyle?: "full" | "long" | "medium" | "short";
  /** Predefined time style. Omit to render date-only. */
  timeStyle?: "full" | "long" | "medium" | "short";
}

/**
 * Format a date using `Intl.DateTimeFormat`. Accepts `Date`, ISO string,
 * or epoch milliseconds.
 *
 * @example
 * formatDate(new Date())                       // "Jan 15, 2024"
 * formatDate("2024-01-15T12:00:00Z", { timeStyle: "short" }) // "Jan 15, 2024, 12:00 PM"
 */
export function formatDate(
  date: Date | string | number,
  opts: FormatDateOptions = {},
): string {
  const d =
    typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(opts.locale ?? "en-US", {
    dateStyle: opts.dateStyle ?? "medium",
    timeStyle: opts.timeStyle,
  }).format(d);
}

/**
 * Format a date as a relative time string ("3 days ago", "in 2 hours").
 * Uses `Intl.RelativeTimeFormat` with `numeric: "auto"`.
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale = "en-US",
): string {
  const d =
    typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const months = Math.round(days / 30);
  const years = Math.round(days / 365);

  if (Math.abs(years) >= 1) return rtf.format(years, "year");
  if (Math.abs(months) >= 1) return rtf.format(months, "month");
  if (Math.abs(days) >= 1) return rtf.format(days, "day");
  if (Math.abs(hours) >= 1) return rtf.format(hours, "hour");
  if (Math.abs(minutes) >= 1) return rtf.format(minutes, "minute");
  return rtf.format(seconds, "second");
}

/**
 * Format a number as a currency string.
 *
 * @example formatCurrency(12.5)           // "$12.50"
 * @example formatCurrency(12.5, "EUR")     // "€12.50"
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

/**
 * Format a byte count as a human-readable string (binary units, 1024 base).
 *
 * @example formatBytes(1536)        // "1.5 KB"
 * @example formatBytes(0)           // "0 B"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB"] as const;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Format a number using compact notation (1.2K, 3.4M, …).
 *
 * @example formatNumber(1234)       // "1.2K"
 * @example formatNumber(0.95, { maximumFractionDigits: 0 }) // "1"
 */
export function formatNumber(
  n: number,
  opts: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    ...opts,
  }).format(n);
}

/**
 * Truncate a string to `max` characters, appending an ellipsis when truncated.
 * The ellipsis counts toward the limit, so the result is always ≤ `max` chars.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  if (max <= 1) return str.slice(0, max);
  return str.slice(0, max - 1) + "…";
}

/**
 * Convert arbitrary text into a URL-friendly slug.
 *
 * Lowercases, strips non-word characters (except spaces/hyphens), collapses
 * runs of whitespace/hyphens/underscores into single hyphens, and trims
 * leading/trailing hyphens.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Validation helpers (lightweight, no Zod required)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fast, dependency-free email sanity check. Use `emailSchema` for strict validation. */
export function isValidEmail(str: string): boolean {
  return EMAIL_RE.test(str);
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Split an array into chunks of at most `size` elements. The final chunk may
 * be smaller than `size` when the array length is not evenly divisible.
 *
 * @throws {RangeError} when `size < 1`.
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError("chunk: size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Return a new array with duplicates removed, keyed by the result of `keyFn`.
 * Stable: the first occurrence wins.
 */
export function uniqueBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => string | number,
): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/**
 * Group array items into a record keyed by `keyFn(item)`.
 */
export function groupBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    const bucket = out[k];
    if (bucket) {
      bucket.push(item);
    } else {
      out[k] = [item];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

/**
 * Return a shallow copy of `obj` with `keys` omitted. Does not mutate input.
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const out: Partial<T> = { ...obj };
  for (const k of keys) {
    delete out[k];
  }
  return out as Omit<T, K>;
}

/**
 * Return a shallow copy of `obj` containing only `keys`. Does not mutate input.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (k in obj) {
      out[k] = obj[k];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// JSON / id / hash
// ---------------------------------------------------------------------------

/**
 * Parse `str` as JSON, returning `fallback` on any parse error. The fallback
 * type is preserved so callers get a typed value either way.
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Generate a RFC 4122 v4 UUID via the Web Crypto API.
 * Works in Node 19+ (server) and modern browsers.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Djb2 string hash. Fast, deterministic, 32-bit unsigned. Not
 * cryptographically secure — use only for hash tables / cache keys.
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    // Coerce to 32-bit signed, then to unsigned.
    hash = hash & 0xffffffff;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Resolve after `ms` milliseconds. Use for spacing out retries or
 * delaying non-critical work.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Alias of {@link delay} for code that reads more naturally with `sleep`. */
export const sleep = delay;

/** Options for {@link retry}. */
export interface RetryOptions {
  /** Maximum number of retry attempts after the first failure. Default 3. */
  retries?: number;
  /** Initial delay before the first retry, in ms. Default 200. */
  delayMs?: number;
  /** Multiplier applied to the delay after each retry. Default 2. */
  backoffFactor?: number;
  /** Hard cap on the per-attempt delay, in ms. Default 10_000. */
  maxDelayMs?: number;
  /** Predicate deciding whether a given error should trigger a retry. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Invoke `fn` with exponential backoff. The function is awaited; on rejection
 * the error is passed through `shouldRetry` (default: always retry) and, if
 * allowed and attempts remain, retried after a delay. The final error is
 * re-thrown when retries are exhausted.
 *
 * @example
 * const data = await retry(() => fetch(url).then(r => r.json()), {
 *   retries: 5,
 *   shouldRetry: (err) => err instanceof TypeError, // network errors only
 * });
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    delayMs = 200,
    backoffFactor = 2,
    maxDelayMs = 10_000,
    shouldRetry = () => true,
  } = opts;

  let attempt = 0;
  let currentDelay = delayMs;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) {
        throw error;
      }
      await delay(Math.min(currentDelay, maxDelayMs));
      currentDelay *= backoffFactor;
      attempt += 1;
    }
  }
}
