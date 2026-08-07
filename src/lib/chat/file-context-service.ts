/**
 * Supa AI — File Context service (Phase 3).
 *
 * Owns the `files` table (Phase 1 schema) and the `message_attachments`
 * join table (Phase 3 schema). Bridges the chat surface to Supabase Storage
 * `uploads` bucket: validates, uploads, persists metadata, attaches to
 * messages, and extracts text content for AI context.
 *
 * Extraction contract (Phase 3):
 *   - `.txt`, `.md`   — full UTF-8 text.
 *   - `.json`         — pretty-printed JSON.
 *   - `.csv`          — raw text (the AI parses it).
 *   - `.pdf`          — best-effort text extraction from a text-based PDF.
 *                       If extraction fails (encrypted / scanned / malformed),
 *                       returns an honest metadata note. We do NOT ship a
 *                       heavyweight PDF parser in Phase 3 — see {@link extractPdfText}.
 *   - `.docx`, `.xlsx`— metadata note only. A future phase can add
 *                       `mammoth.js` / `exceljs`.
 *
 * The service is constructed with a {@link StorageService} (typed storage
 * wrapper) + the underlying supabase client (for DB queries + raw downloads).
 *
 * @module @/lib/chat/file-context-service
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  StorageService,
  createStorage,
  type UploadResult,
} from "@/lib/storage";
import type { Tables, TablesInsert } from "@/lib/supabase/types";

import {
  inferMimeTypeFromName,
  validateChatFile,
} from "@/lib/chat/file-validation";

/** Row shape for the `files` table. */
export type UploadedFile = Tables<"files">;

/** Row shape for the `message_attachments` table. */
export type MessageAttachment = Tables<"message_attachments">;

/**
 * Service object encapsulating all Phase 3 file-context operations.
 *
 * Constructed with a {@link StorageService} (for typed upload/delete/list)
 * and the underlying supabase client (for DB queries + raw object downloads
 * during content extraction). The canonical factory
 * {@link createFileContextService} wires both with the RLS-enforced server
 * client.
 */
export class FileContextService {
  constructor(
    private readonly storage: StorageService,
    private readonly supabase: AnySupabaseClient,
  ) {}

  // -----------------------------------------------------------------------
  // Upload / read / list / delete
  // -----------------------------------------------------------------------

  /**
   * Upload a file to the `uploads` bucket + persist a `files` row.
   *
   * Steps:
   *   1. Validate MIME + size with {@link validateChatFile} (defense-in-depth
   *      on top of the global upload allowlist).
   *   2. Upload via {@link StorageService.upload} — RLS uses the leading
   *      `{userId}` segment of the storage path to authorize the owner.
   *   3. Insert a `files` row referencing the storage path + filename +
   *      MIME + size.
   *
   * @returns The persisted `files` row (with the generated `id`).
   *
   * @throws {ValidationError} if the file fails chat-upload validation.
   * @throws {StorageError} if the Supabase Storage upload fails.
   * @throws {DatabaseError} if the `files` row insert fails.
   */
  async uploadFile(
    userId: string,
    file: File,
    _conversationId?: string,
  ): Promise<UploadedFile> {
    // 1. Validate. Use the inferred MIME as a fallback for browsers that
    //    report empty `File.type` on `.md` / `.csv`.
    const effectiveType = file.type || inferMimeTypeFromName(file.name);
    const validation = validateChatFile({
      name: file.name,
      type: effectiveType,
      size: file.size,
    });
    if (!validation.ok) {
      throw new ValidationError(validation.reason, {
        filename: file.name,
        mimeType: effectiveType,
        size: file.size,
      });
    }

    // 2. Upload to the `uploads` bucket. StorageService.upload will also
    //    run the global + per-bucket validation, but we already did the
    //    chat-specific check above so the error message is friendlier.
    let upload: UploadResult;
    try {
      upload = await this.storage.upload(
        "uploads",
        userId,
        {
          name: file.name,
          type: effectiveType,
          size: file.size,
          body: file,
        },
        { contentType: effectiveType },
      );
    } catch (err) {
      // StorageService already wraps into StorageError; just rethrow.
      throw err;
    }

    // 3. Insert the `files` row.
    const row: TablesInsert<"files"> = {
      user_id: userId,
      storage_path: upload.path,
      filename: file.name,
      mime_type: effectiveType,
      size_bytes: file.size,
    };

    try {
      const { data, error } = await this.supabase
        .from("files")
        .insert(row)
        .select()
        .single();

      if (error) throw this.toDbError(error, "uploadFile.insert failed");
      if (!data) {
        throw new DatabaseError("File insert returned no row.", {
          userId,
          path: upload.path,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) {
        // Best-effort cleanup: roll back the storage upload so we don't
        // leave an orphaned object in the bucket.
        try {
          await this.storage.delete("uploads", upload.path);
        } catch (cleanupErr) {
          logger.warn("uploadFile: orphaned storage object after DB insert failure", {
            userId,
            path: upload.path,
            cleanupError: (cleanupErr as Error)?.message,
          });
        }
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure persisting file metadata.", {
        userId,
        path: upload.path,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch a single `files` row by id. Returns `null` if the row doesn't
   * exist or RLS hides it (caller doesn't own it).
   */
  async getFile(
    userId: string,
    fileId: string,
  ): Promise<UploadedFile | null> {
    try {
      const { data, error } = await this.supabase
        .from("files")
        .select()
        .eq("id", fileId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "getFile failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading file metadata.", {
        userId,
        fileId,
        cause: appErr.message,
      });
    }
  }

  /**
   * List the caller's files. Optionally filtered by `conversationId`
   * (resolved via the `message_attachments` join — files attached to any
   * message in the conversation). Defaults to the most recent 50.
   */
  async listFiles(
    userId: string,
    opts: { conversationId?: string; limit?: number } = {},
  ): Promise<UploadedFile[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));

    try {
      if (opts.conversationId) {
        // Join through message_attachments → ai_messages → ai_conversations
        // to scope to the conversation. We use an inner-select on
        // `message_attachments` joined to `ai_messages` for the conversation
        // filter. Postgrest doesn't support multi-table joins in `select()`
        // without an explicit relationship, so we fetch message_ids first
        // and then list attachments → files.
        const { data: msgs, error: msgsErr } = await this.supabase
          .from("ai_messages")
          .select("id")
          .eq("conversation_id", opts.conversationId);

        if (msgsErr) throw this.toDbError(msgsErr, "listFiles.messages failed");
        const messageIds = (msgs ?? []).map((m) => m.id);
        if (messageIds.length === 0) return [];

        const { data: attachments, error: attErr } = await this.supabase
          .from("message_attachments")
          .select("file_id")
          .in("message_id", messageIds);

        if (attErr) throw this.toDbError(attErr, "listFiles.attachments failed");
        const fileIds = Array.from(
          new Set((attachments ?? []).map((a) => a.file_id)),
        );
        if (fileIds.length === 0) return [];

        const { data: files, error: filesErr } = await this.supabase
          .from("files")
          .select()
          .eq("user_id", userId)
          .in("id", fileIds)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (filesErr) throw this.toDbError(filesErr, "listFiles.files failed");
        return files ?? [];
      }

      const { data, error } = await this.supabase
        .from("files")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw this.toDbError(error, "listFiles failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing files.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Permanently delete a file: removes the `files` row (which cascades to
   * `message_attachments` via FK on-delete cascade) AND deletes the underlying
   * Storage object. Idempotent — returns silently if neither exists.
   *
   * Order: delete the DB row first (so the storage path is captured before
   * the row is gone), then delete the storage object. If the storage delete
   * fails, we log it but don't fail the request — the DB row is already
   * gone, so the user perceives the file as deleted and an orphaned object
   * will be cleaned up by a future storage GC sweep.
   */
  async deleteFile(userId: string, fileId: string): Promise<void> {
    let storagePath: string | null = null;

    try {
      // Capture the path before deleting the row.
      const { data: existing, error: readErr } = await this.supabase
        .from("files")
        .select("storage_path")
        .eq("id", fileId)
        .eq("user_id", userId)
        .maybeSingle();

      if (readErr) throw this.toDbError(readErr, "deleteFile.read failed");
      if (!existing) {
        // Already gone — idempotent delete.
        return;
      }
      storagePath = existing.storage_path;

      const { error: delErr } = await this.supabase
        .from("files")
        .delete()
        .eq("id", fileId)
        .eq("user_id", userId);

      if (delErr) throw this.toDbError(delErr, "deleteFile.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting file metadata.", {
        userId,
        fileId,
        cause: appErr.message,
      });
    }

    // Best-effort storage cleanup.
    if (storagePath) {
      try {
        await this.storage.delete("uploads", storagePath);
      } catch (err) {
        logger.warn("deleteFile: storage cleanup failed (best-effort)", {
          userId,
          fileId,
          path: storagePath,
          error: (err as Error)?.message,
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Message attachments
  // -----------------------------------------------------------------------

  /**
   * Attach a file to a chat message by inserting a `message_attachments`
   * row. The caller must own both the message (RLS-enforced via the
   * `attachments_insert_via_message` policy) and the file.
   *
   * @throws {NotFoundError} if the file doesn't exist or isn't owned by the
   *   caller.
   * @throws {ValidationError} if the file is already attached to the
   *   message (no-op idempotency — surface as a friendly error).
   */
  async attachToMessage(
    userId: string,
    messageId: string,
    fileId: string,
  ): Promise<void> {
    // Verify the caller owns the file.
    const file = await this.getFile(userId, fileId);
    if (!file) {
      throw new NotFoundError("File", fileId);
    }

    // Compute the next sort_order for this message (1 + max existing).
    let sortOrder = 0;
    try {
      const { data: existing, error: listErr } = await this.supabase
        .from("message_attachments")
        .select("sort_order")
        .eq("message_id", messageId)
        .order("sort_order", { ascending: false })
        .limit(1);

      if (listErr) throw this.toDbError(listErr, "attachToMessage.list failed");
      if (existing && existing.length > 0) {
        sortOrder = (existing[0].sort_order ?? 0) + 1;
      }
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure computing attachment sort order.",
        { userId, messageId, fileId, cause: appErr.message },
      );
    }

    const row: TablesInsert<"message_attachments"> = {
      message_id: messageId,
      file_id: fileId,
      sort_order: sortOrder,
    };

    try {
      const { error } = await this.supabase
        .from("message_attachments")
        .insert(row);

      if (error) {
        // PGRST116 / 23505 (unique violation) → idempotency guard.
        if (error.code === "23505") {
          throw new ValidationError(
            "File is already attached to this message.",
            { messageId, fileId },
          );
        }
        throw this.toDbError(error, "attachToMessage.insert failed");
      }
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof NotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure attaching file to message.", {
        userId,
        messageId,
        fileId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Content extraction (AI context)
  // -----------------------------------------------------------------------

  /**
   * Extract text content from an uploaded file for AI context.
   *
   * Behavior by type (see module docstring for the full contract):
   *   - `text/plain`, `text/markdown` → full UTF-8 text.
   *   - `application/json`            → pretty-printed JSON.
   *   - `text/csv`                    → raw text (verbatim).
   *   - `application/pdf`             → best-effort text extraction; falls
   *                                     back to a metadata note.
   *   - DOCX / XLSX                   → metadata note (parser not bundled).
   *
   * The returned string is intended to be embedded in the AI prompt — it
   * is plain text, no framing. Use {@link buildContextPrefix} when you
   * want the wrapped `[File context]…[/File context]` form.
   *
   * @returns The extracted text. Never throws for extraction failures —
   *   returns a metadata note instead so the AI request still goes through.
   */
  async extractContext(file: UploadedFile): Promise<string> {
    const mimeType = file.mime_type ?? inferMimeTypeFromName(file.filename ?? "");
    const filename = file.filename ?? "file";
    const size = file.size_bytes ?? 0;

    // Text-like types: download + decode.
    if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      mimeType === "application/json" ||
      mimeType === "text/csv"
    ) {
      const raw = await this.downloadAsText(file);
      if (raw === null) {
        return this.metadataNote(file, mimeType);
      }
      if (mimeType === "application/json") {
        return prettyPrintJson(raw, filename, size);
      }
      return raw;
    }

    // PDF: best-effort extraction.
    if (mimeType === "application/pdf") {
      return extractPdfText(await this.downloadAsBytes(file), filename, size);
    }

    // DOCX / XLSX: parser not bundled in Phase 3.
    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return `[DOCX file: ${filename}, ${size} bytes — content extraction requires a DOCX parser]`;
    }
    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return `[XLSX file: ${filename}, ${size} bytes — content extraction requires an XLSX parser]`;
    }

    // Unknown type — honest metadata note.
    return this.metadataNote(file, mimeType);
  }

  /**
   * Build the `[File context]…[/File context]` prefix string that gets
   * prepended to the AI prompt when one or more files are attached to a
   * message. Files with extractable text are inlined; files without
   * extraction (PDF that failed, DOCX, XLSX, unknown) include only a
   * metadata note.
   *
   * Returns an empty string when `attachments` is empty.
   *
   * Example output (two files, one text + one PDF that failed extraction):
   *
   * ```text
   * [File context]
   * notes.txt:
   * <full text content>
   *
   * report.pdf:
   * [PDF file: report.pdf, 102400 bytes — content extraction not available]
   * [/File context]
   *
   * ```
   */
  async buildContextPrefix(
    attachments: readonly UploadedFile[],
  ): Promise<string> {
    if (!attachments || attachments.length === 0) return "";

    const blocks: string[] = [];
    for (const file of attachments) {
      const content = await this.extractContext(file);
      blocks.push(`${file.filename ?? "file"}:\n${content}`);
    }

    return `[File context]\n${blocks.join("\n\n")}\n[/File context]\n\n`;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Download the file from Supabase Storage and decode as UTF-8 text.
   * Returns `null` on any failure (network error, missing object, decode
   * error) so the caller can fall back to a metadata note.
   */
  private async downloadAsText(file: UploadedFile): Promise<string | null> {
    try {
      const blob = await this.download(file);
      if (!blob) return null;
      // `Blob.text()` returns a UTF-8 decoded string (Web standard).
      return await blob.text();
    } catch (err) {
      logger.warn("downloadAsText: extraction failed", {
        fileId: file.id,
        path: file.storage_path,
        error: (err as Error)?.message,
      });
      return null;
    }
  }

  /**
   * Download the file as raw bytes. Returns `null` on any failure.
   */
  private async downloadAsBytes(
    file: UploadedFile,
  ): Promise<Uint8Array | null> {
    try {
      const blob = await this.download(file);
      if (!blob) return null;
      const buf = await blob.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      logger.warn("downloadAsBytes: extraction failed", {
        fileId: file.id,
        path: file.storage_path,
        error: (err as Error)?.message,
      });
      return null;
    }
  }

  /**
   * Download the file from the `uploads` bucket. Returns the `Blob` or
   * `null` if the object is missing / download failed.
   */
  private async download(file: UploadedFile): Promise<Blob | null> {
    const { data, error } = await this.supabase.storage
      .from("uploads")
      .download(file.storage_path);

    if (error) {
      logger.warn("download: storage download failed", {
        fileId: file.id,
        path: file.storage_path,
        error: error.message,
      });
      return null;
    }
    return data ?? null;
  }

  /**
   * Build a metadata-only note for files we can't extract (PDF that failed,
   * DOCX, XLSX, unknown). Keeps the AI aware of the attachment's existence
   * without leaking the (unavailable) content.
   */
  private metadataNote(file: UploadedFile, mimeType: string): string {
    const filename = file.filename ?? "file";
    const size = file.size_bytes ?? 0;
    return `[${mimeType || "unknown"} file: ${filename}, ${size} bytes — content extraction not available]`;
  }

  /**
   * Map a Postgrest error into our {@link DatabaseError}.
   */
  private toDbError(
    error: { code?: string; message?: string; name?: string; details?: unknown },
    message: string,
  ): DatabaseError {
    return new DatabaseError(message, {
      errorCode: error.code,
      errorName: error.name,
      errorMessage: error.message,
      errorDetails: error.details,
    });
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

/**
 * Pretty-print a JSON string. If parsing fails, returns the raw string
 * prefixed with a header noting the file's name + size and a parse-error
 * notice (so the AI can still try to make sense of it).
 */
function prettyPrintJson(raw: string, filename: string, size: number): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    logger.warn("prettyPrintJson: parse failed, returning raw text", {
      filename,
      size,
      error: (err as Error)?.message,
    });
    return (
      `[JSON file: ${filename}, ${size} bytes — content failed to parse as ` +
      `valid JSON; showing raw text below]\n\n${raw}`
    );
  }
}

/**
 * Best-effort text extraction from a PDF.
 *
 * Phase 3 limitation: we don't ship a heavyweight PDF parser (pdf-parse,
 * pdfjs-dist, etc.) to keep the bundle small. Instead we scan the raw PDF
 * bytes for text streams between `BT` and `ET` markers and unescape the
 * parenthesized string literals. This works for *unencrypted, text-based*
 * PDFs (most programmatically generated ones) and silently fails for:
 *   - Scanned PDFs (no text stream — just images).
 *   - Encrypted / password-protected PDFs.
 *   - PDFs using CID fonts without ToUnicode mappings.
 *
 * When extraction yields nothing useful, we return an honest metadata note
 * rather than an empty string — the AI should know the file exists even if
 * we can't show it the content.
 */
function extractPdfText(
  bytes: Uint8Array | null,
  filename: string,
  size: number,
): string {
  if (!bytes || bytes.length === 0) {
    return `[PDF file: ${filename}, ${size} bytes — content extraction not available]`;
  }

  try {
    // Decode as Latin-1 to preserve byte values 1:1 (PDF text operators
    // use ASCII for the structural keywords; the string literals may be
    // UTF-16 / CID-encoded which we won't fully recover, but the common
    // case of ASCII text in `(…)` literals will work).
    const decoder = new TextDecoder("latin1");
    const raw = decoder.decode(bytes);

    const chunks: string[] = [];
    // Match text-showing operators: `(literal) Tj`, `[(lit1) -250 (lit2)] TJ`.
    // We only capture the parenthesized literals.
    const literalPattern = /\(((?:\\.|[^\\()])*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = literalPattern.exec(raw)) !== null) {
      const literal = unescapePdfLiteral(match[1]);
      if (literal.trim().length > 0) {
        chunks.push(literal);
      }
      // Cap extraction to the first ~512 KB of text to bound the work.
      if (chunks.join("").length > 512 * 1024) break;
    }

    const text = chunks.join("").trim();
    if (text.length === 0) {
      return `[PDF file: ${filename}, ${size} bytes — content extraction not available]`;
    }

    // Truncate to a reasonable context window for AI consumption.
    const MAX_CHARS = 50_000;
    const trimmed = text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS) + "\n\n[... content truncated ...]"
      : text;

    return trimmed;
  } catch (err) {
    logger.warn("extractPdfText: extraction failed", {
      filename,
      size,
      error: (err as Error)?.message,
    });
    return `[PDF file: ${filename}, ${size} bytes — content extraction not available]`;
  }
}

/**
 * Unescape a PDF string literal (the content between `(` and `)`). PDF
 * supports the following escape sequences: `\n`, `\r`, `\t`, `\b`, `\f`,
 * `\(`, `\)`, `\\`, `\` + octal digits (1–3), and `\` + EOL (line
 * continuation).
 */
function unescapePdfLiteral(literal: string): string {
  let out = "";
  let i = 0;
  while (i < literal.length) {
    const ch = literal[i];
    if (ch !== "\\") {
      out += ch;
      i += 1;
      continue;
    }
    // Escape sequence.
    const next = literal[i + 1];
    if (next === undefined) {
      // Trailing backslash — keep it.
      out += "\\";
      break;
    }
    switch (next) {
      case "n":
        out += "\n";
        i += 2;
        break;
      case "r":
        out += "\r";
        i += 2;
        break;
      case "t":
        out += "\t";
        i += 2;
        break;
      case "b":
        out += "\b";
        i += 2;
        break;
      case "f":
        out += "\f";
        i += 2;
        break;
      case "(":
        out += "(";
        i += 2;
        break;
      case ")":
        out += ")";
        i += 2;
        break;
      case "\\":
        out += "\\";
        i += 2;
        break;
      case "\n":
        // Line continuation.
        i += 2;
        break;
      case "\r":
        i += 2;
        // Swallow a following \n (CRLF line continuation).
        if (literal[i] === "\n") i += 1;
        break;
      default: {
        // Octal escape (1–3 digits).
        if (next >= "0" && next <= "7") {
          let octal = "";
          let j = i + 1;
          while (j < literal.length && octal.length < 3 && literal[j] >= "0" && literal[j] <= "7") {
            octal += literal[j];
            j += 1;
          }
          out += String.fromCharCode(parseInt(octal, 8));
          i = j;
        } else {
          // Unknown escape — keep the next character verbatim.
          out += next;
          i += 2;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the canonical RLS-enforced `FileContextService` for use in
 * Server Components + Route Handlers. The caller's auth session is
 * propagated; only their own `files` rows are reachable.
 */
export async function createFileContextService(): Promise<FileContextService> {
  const storage = await createStorage();
  const supabase = await createSupabaseServerClient();
  return new FileContextService(storage, supabase);
}
