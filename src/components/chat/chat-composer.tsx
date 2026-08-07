"use client";

/**
 * Supa AI — Chat composer (Phase 3).
 *
 * The input area at the bottom of the chat window. Composed of:
 *
 *   - Auto-resizing `<Textarea>` (Enter to send, Shift+Enter for a
 *     newline). Max 6 visible rows before it scrolls internally.
 *   - File attach button (paperclip) — opens the native file picker,
 *     validates each file with the shared `validateChatFile` helper
 *     (MIME + size), uploads via POST `/api/chat/files` (multipart),
 *     and shows attached-file chips with remove buttons. The uploaded
 *     file ids are sent with the next message as `attachmentIds`.
 *   - Model picker button — opens {@link ModelPicker}.
 *   - Prompt template button — opens {@link PromptTemplatePicker}.
 *   - Send button — disabled when the textarea is empty or a stream
 *     is in flight.
 *   - Stop button — shown when a stream is active; aborts the
 *     in-flight `AbortController` via `useChatStream.stopGeneration`.
 *   - Character / token estimate (chars / 4 ≈ tokens).
 *
 * When a stream is active the textarea is disabled and the composer
 * shows a subtle "Generating…" state.
 *
 * @module @/components/chat/chat-composer
 */
import * as React from "react";
import {
  ArrowUp,
  FileText,
  Loader2,
  Paperclip,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/index";
import {
  ALLOWED_CHAT_FILE_TYPES,
  MAX_CHAT_FILE_SIZE_BYTES,
  inferMimeTypeFromName,
  validateChatFile,
} from "@/lib/chat/file-validation";
import type { StreamResult } from "@/hooks/use-chat-stream";
import {
  useUploadFile,
  type ChatApiError,
  type UploadedFile,
} from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { ModelPicker } from "./model-picker";
import { PromptTemplatePicker } from "./prompt-template-picker";

/** Maximum visible rows of the textarea before it scrolls internally. */
const MAX_TEXTAREA_ROWS = 6;
/** Rough chars-per-token estimate used by the token counter. */
const CHARS_PER_TOKEN = 4;

/** Props accepted by {@link ChatComposer}. */
export interface ChatComposerProps {
  /** The active conversation id. When `null`, the composer is in
   * "create-on-send" mode: the first message triggers a create. */
  conversationId: string | null;
  /** Send a message. The composer calls this with the trimmed text +
   * attachment ids; the parent decides whether to create a
   * conversation first or send into the existing one. */
  onSend: (content: string, attachmentIds: string[]) => Promise<StreamResult>;
  /** Stop the in-flight stream. */
  onStop: () => void;
  /** Whether a stream is currently in flight. */
  isGenerating: boolean;
}

/** An attached file (uploaded or pending). */
interface Attachment {
  /** Local id (for React keys) — set to the uploaded file id when done. */
  localId: string;
  /** Filename. */
  name: string;
  /** MIME type (validated client-side). */
  mimeType: string;
  /** Size in bytes. */
  size: number;
  /** Upload state. */
  status: "uploading" | "done" | "error";
  /** The uploaded file id (when `status === "done"`). */
  fileId?: string;
  /** Error message (when `status === "error"`). */
  error?: string;
}

/** Auto-resize the textarea to fit content (capped at MAX_TEXTAREA_ROWS). */
function useAutoResize(value: string) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22;
    const max = lineHeight * MAX_TEXTAREA_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);
  return ref;
}

/** The composer. */
export function ChatComposer({
  conversationId,
  onSend,
  onStop,
  isGenerating,
}: ChatComposerProps) {
  const [text, setText] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadMutation = useUploadFile();

  const textareaRef = useAutoResize(text);

  const tokenEstimate = Math.max(
    0,
    Math.ceil(text.length / CHARS_PER_TOKEN),
  );

  const canSend =
    !isGenerating &&
    (text.trim().length > 0 ||
      attachments.some((a) => a.status === "done"));

  /** Handle the file picker "change" event. */
  const handleFileSelect = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      // Reset the input so the same file can be re-selected later.
      e.target.value = "";
      if (files.length === 0) return;

      for (const file of files) {
        const validation = validateChatFile({
          name: file.name,
          type: file.type || inferMimeTypeFromName(file.name),
          size: file.size,
        });
        if (!validation.ok) {
          toast.error(`${file.name}: ${validation.reason}`);
          continue;
        }

        const localId = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const mimeType = file.type || inferMimeTypeFromName(file.name);
        const attachment: Attachment = {
          localId,
          name: file.name,
          mimeType,
          size: file.size,
          status: "uploading",
        };
        setAttachments((prev) => [...prev, attachment]);

        try {
          const uploaded: UploadedFile =
            await uploadMutation.mutateAsync(file);
          setAttachments((prev) =>
            prev.map((a) =>
              a.localId === localId
                ? {
                    ...a,
                    status: "done",
                    fileId: uploaded.id,
                  }
                : a,
            ),
          );
        } catch (err) {
          const e = err as ChatApiError;
          setAttachments((prev) =>
            prev.map((a) =>
              a.localId === localId
                ? { ...a, status: "error", error: e.message }
                : a,
            ),
          );
          toast.error(`${file.name}: ${e.message ?? "Upload failed."}`);
        }
      }
    },
    [uploadMutation],
  );

  /** Remove an attachment (and best-effort delete the uploaded file). */
  const handleRemoveAttachment = React.useCallback(
    (localId: string) => {
      setAttachments((prev) => {
        const target = prev.find((a) => a.localId === localId);
        if (target?.fileId) {
          // Best-effort delete — ignore failures (the file will be
          // orphaned, which is harmless).
          fetch(`/api/chat/files/${target.fileId}`, {
            method: "DELETE",
            credentials: "include",
          }).catch(() => {});
        }
        return prev.filter((a) => a.localId !== localId);
      });
    },
    [],
  );

  /** Insert a rendered template into the textarea. */
  const handleInsertTemplate = React.useCallback((content: string) => {
    setText((prev) => {
      if (!prev.trim()) return content;
      return `${prev}\n\n${content}`;
    });
    setTemplatePickerOpen(false);
  }, []);

  /** Send the message. */
  const handleSend = React.useCallback(async () => {
    if (!canSend) return;
    const content = text.trim();
    if (!content && attachments.every((a) => a.status !== "done")) return;
    // Wait for any in-flight uploads to finish (simplest: just block).
    if (attachments.some((a) => a.status === "uploading")) {
      toast.message("Waiting for uploads to finish…");
      return;
    }
    const attachmentIds = attachments
      .filter((a) => a.status === "done" && a.fileId)
      .map((a) => a.fileId as string);

    setText("");
    setAttachments([]);
    try {
      await onSend(content, attachmentIds);
    } catch (err) {
      const e = err as ChatApiError;
      toast.error(e.message ?? "Couldn't send message.");
      // Restore the text so the user can retry without retyping.
      setText(content);
    }
  }, [attachments, canSend, onSend, text]);

  /** Textarea keydown: Enter to send, Shift+Enter for newline. */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const acceptAttr = ALLOWED_CHAT_FILE_TYPES.join(",");
  const maxMb = (MAX_CHAT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);

  return (
    <div className="border-t bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-3">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <div
                key={a.localId}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  a.status === "error"
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : "border-border bg-muted/40 text-foreground",
                )}
              >
                <FileText className="size-3.5" aria-hidden="true" />
                <span className="max-w-[160px] truncate">{a.name}</span>
                <span className="text-muted-foreground">
                  {formatBytes(a.size)}
                </span>
                {a.status === "uploading" && (
                  <Loader2
                    className="size-3 animate-spin"
                    aria-label="Uploading"
                  />
                )}
                {a.status === "error" && (
                  <span className="text-destructive">failed</span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(a.localId)}
                  aria-label={`Remove ${a.name}`}
                  className="ml-0.5 rounded p-0.5 hover:bg-accent"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea wrapper */}
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="chat-composer-input" className="sr-only">
              Message
            </Label>
            <Textarea
              id="chat-composer-input"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isGenerating
                  ? "Generating response…"
                  : "Send a message — Enter to send, Shift+Enter for a new line"
              }
              disabled={isGenerating}
              rows={1}
              className="min-h-[44px] resize-none border-border bg-background px-3 py-2.5 text-sm leading-relaxed"
              aria-label="Message"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={acceptAttr}
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-hidden="true"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Attach file"
                      disabled={isGenerating}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="size-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Attach a file (text, md, json, csv, pdf, docx, xlsx — up to{" "}
                    {maxMb} MB)
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Browse prompt templates"
                      disabled={isGenerating}
                      onClick={() => setTemplatePickerOpen(true)}
                    >
                      <Wand2 className="size-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Prompt templates</TooltipContent>
                </Tooltip>
                <ModelPicker compact disabled={isGenerating} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {tokenEstimate > 0 && (
                  <span>~{tokenEstimate.toLocaleString()} tokens</span>
                )}
                {isGenerating ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={onStop}
                    aria-label="Stop generating"
                  >
                    <Square className="size-3 fill-current" aria-hidden="true" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleSend}
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PromptTemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onInsert={handleInsertTemplate}
        currentText={text}
      />

      {/* Hint about which conversation we're targeting — useful when
          conversationId is null (the composer will create one on send). */}
      {!conversationId && (
        <p className="mx-auto mb-1 w-full max-w-3xl px-4 text-[11px] text-muted-foreground">
          A new conversation will be created when you send.
        </p>
      )}
    </div>
  );
}
