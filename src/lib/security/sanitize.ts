/**
 * Supa AI — Input sanitization helpers.
 *
 * Lightweight, dependency-free helpers for the common cases: filename
 * cleaning, basic HTML escaping + script/style stripping, and PII masking
 * for logs. These are NOT a substitute for a real HTML sanitizer in a
 * rich-text editor — for that, use DOMPurify on the client.
 *
 * Server-safe (pure functions, no Node APIs).
 *
 * @module @/lib/security/sanitize
 */

/** Whitelist of filename characters; everything else becomes `_`. */
const FILENAME_ALLOWED = /[^a-zA-Z0-9._-]/g;

/**
 * Clean a user-supplied filename: strip path separators, collapse weird
 * chars, enforce a max length, lowercase extension. Does NOT touch disk.
 */
export function sanitizeFilename(name: string, maxLen = 128): string {
  if (!name) return "untitled";
  // Drop any path components — no directory traversal.
  const base = name.replace(/[/\\]+/g, "_").replace(/^\.+/, "");
  const cleaned = base.replace(FILENAME_ALLOWED, "_").replace(/_+/g, "_");
  const trimmed = cleaned.slice(0, maxLen);
  // Lowercase extension for normalization.
  const dot = trimmed.lastIndexOf(".");
  if (dot > 0 && dot < trimmed.length - 1) {
    const stem = trimmed.slice(0, dot);
    const ext = trimmed.slice(dot + 1).toLowerCase();
    return `${stem}.${ext}`;
  }
  return trimmed;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Basic HTML sanitizer for Phase 1: escapes everything, then strips the
 * content of <script> and <style> tags entirely (so even if the escaped
 * form is later unescaped, the malicious content is gone). For rich text,
 * use a full parser-based sanitizer (DOMPurify) — not this.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  // First, drop <script>...</script> and <style>...</style> entirely.
  const stripped = html
    .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, "")
    .replace(/<\s*iframe[\s\S]*?<\/\s*iframe\s*>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
  return escapeHtml(stripped);
}

/**
 * Mask an email for display in logs/UI: `jane.doe@example.com` -> `j***e@e*****.com`.
 * Never logs the full address.
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const maskedLocal =
    local.length <= 2
      ? "*".repeat(local.length)
      : `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}`;
  const dotIdx = domain.lastIndexOf(".");
  const domainRoot = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
  const tld = dotIdx > 0 ? domain.slice(dotIdx) : "";
  const maskedDomain =
    domainRoot.length <= 1
      ? "*"
      : `${domainRoot[0]}${"*".repeat(Math.max(1, domainRoot.length - 1))}`;
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

/**
 * Mask any secret string, showing only the first and last `visible` chars.
 * Defaults to showing 4 chars on each end. For very short secrets, shows
 * only asterisks.
 */
export function maskSecret(str: string | null | undefined, visible = 4): string {
  if (str === null || str === undefined) return "(none)";
  if (typeof str !== "string") return "(invalid)";
  if (str.length === 0) return "(empty)";
  if (str.length <= visible * 2) return "*".repeat(str.length);
  return `${str.slice(0, visible)}${"*".repeat(Math.min(str.length - visible * 2, 16))}${str.slice(-visible)}`;
}

/**
 * Mask a URL so credentials embedded in it are hidden.
 * `redis://:password@host:6379` -> `redis://***@host:6379`
 */
export function maskUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "";
      return u.toString();
    }
    return url;
  } catch {
    return "(invalid-url)";
  }
}

/**
 * Truncate a string to `maxLen` chars, appending an ellipsis. Useful for
 * logging user input without flooding the log aggregator.
 */
export function truncate(str: string, maxLen = 256): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}…`;
}
