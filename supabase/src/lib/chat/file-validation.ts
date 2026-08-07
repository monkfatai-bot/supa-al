/**
 * Supa AI — Chat file upload validation.
 *
 * Phase 3 chat surface accepts a constrained set of document types for AI
 * context: plain text, markdown, JSON, CSV, PDF, DOCX, and XLSX. This module
 * owns the per-route MIME allowlist (stricter than the global
 * `ALLOWED_UPLOAD_MIME_TYPES`, since chat uploads intentionally exclude
 * images / audio / video — those flow through the dedicated `ai-assets`
 * bucket) and a friendly-label helper for surfacing file types in the UI.
 *
 * The module is pure (no I/O, no `server-only` import) so it can be used
 * both in client components (for instant pre-upload feedback) and in the
 * server-side upload route (defense-in-depth before the bytes hit Supabase
 * Storage).
 *
 * @module @/lib/chat/file-validation
 */

/**
 * MIME types accepted by the Phase 3 chat upload route.
 *
 * Kept in sync with the `uploads` bucket's per-MIME allowlist in
 * `supabase/migrations/0002_storage_buckets.sql` — every entry below is
 * also permitted by the bucket. The bucket itself permits a few additional
 * types (images, presentation files) that the chat surface does not.
 */
export const ALLOWED_CHAT_FILE_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** MIME type accepted by the chat upload route. */
export type AllowedChatFileType = (typeof ALLOWED_CHAT_FILE_TYPES)[number];

/**
 * Max chat-file size in bytes (10 MB).
 *
 * Matches the global `MAX_UPLOAD_SIZE_BYTES` ceiling in
 * `@/lib/constants/security`. We pin a local copy (rather than re-exporting
 * the global) so the chat upload contract is self-contained and won't
 * silently change if the global is raised in a future phase.
 */
export const MAX_CHAT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Minimal structural shape for a file we need to validate. */
export interface ChatFileCandidate {
  name: string;
  type: string;
  size: number;
}

/** Discriminated result of {@link validateChatFile}. */
export type ChatFileValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate a candidate chat-file upload against the chat allowlist + size
 * ceiling.
 *
 * @returns A discriminated result. On failure, `reason` is a human-friendly
 *   message safe to surface to clients.
 *
 * @example
 * ```ts
 * const result = validateChatFile({ name: "report.pdf", type: "application/pdf", size: 123_456 });
 * if (!result.ok) {
 *   toast.error(result.reason);
 *   return;
 * }
 * ```
 */
export function validateChatFile(
  file: ChatFileCandidate,
): ChatFileValidationResult {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    return { ok: false, reason: "File is empty or missing." };
  }

  if (file.size > MAX_CHAT_FILE_SIZE_BYTES) {
    const maxMb = (MAX_CHAT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    const gotMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      ok: false,
      reason: `File size (${gotMb} MB) exceeds the ${maxMb} MB chat-upload limit.`,
    };
  }

  // Some browsers omit the MIME for `.md` and `.csv`; allow these by
  // extension as a fallback so power users aren't punished for their OS.
  const fallbackType = inferMimeTypeFromName(file.name);
  const effectiveType = file.type || fallbackType;

  const allowed = (ALLOWED_CHAT_FILE_TYPES as readonly string[]).includes(
    effectiveType,
  );
  if (!allowed) {
    return {
      ok: false,
      reason: `File type "${effectiveType || "unknown"}" is not supported for chat uploads. Allowed: text, markdown, JSON, CSV, PDF, DOCX, XLSX.`,
    };
  }

  return { ok: true };
}

/**
 * Best-effort MIME inference from a filename's extension. Used as a fallback
 * when the browser reports an empty `File.type` (common for `.md` / `.csv`).
 *
 * Returns an empty string when no mapping is known — callers should treat
 * that as "unknown" and let {@link validateChatFile} reject the file.
 */
export function inferMimeTypeFromName(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "txt":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "";
  }
}

/**
 * Map a MIME type to a human-friendly label for the UI.
 *
 * Falls back to `"File"` for unknown types so we never display raw MIME
 * strings to end users.
 */
export function getFileTypeLabel(mimeType: string | null | undefined): string {
  if (!mimeType) return "File";
  switch (mimeType) {
    case "text/plain":
      return "Text File";
    case "text/markdown":
      return "Markdown";
    case "application/json":
      return "JSON";
    case "text/csv":
      return "CSV";
    case "application/pdf":
      return "PDF Document";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "Word Document";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "Excel Spreadsheet";
    case "image/png":
      return "PNG Image";
    case "image/jpeg":
      return "JPEG Image";
    case "image/webp":
      return "WebP Image";
    case "image/gif":
      return "GIF Image";
    default:
      return "File";
  }
}
