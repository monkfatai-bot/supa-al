"use client";

/**
 * Supa AI — `useCopyToClipboard`.
 *
 * Tiny wrapper around the async Clipboard API. Returns the latest copied
 * value plus a `copy(text)` callback. The `copied` flag resets after a
 * configurable timeout (default 1500ms) so callers can render a transient
 * "Copied!" affordance without wiring their own timer.
 *
 * @module @/hooks/use-copy-to-clipboard
 */
import * as React from "react";

export interface UseCopyToClipboardResult {
  /** The most-recently-copied value, or `null` after the reset timeout. */
  copied: string | null;
  /** Copy the supplied text. Returns `true` on success. */
  copy: (text: string) => Promise<boolean>;
}

export function useCopyToClipboard(
  resetMs = 1500,
): UseCopyToClipboardResult {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback(
    async (text: string): Promise<boolean> => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        setCopied(text);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(null), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { copied, copy };
}
