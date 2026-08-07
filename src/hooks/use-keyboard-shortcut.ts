"use client";

/**
 * Supa AI — `useKeyboardShortcut`.
 *
 * Registers a global key combo (e.g. ⌘K / Ctrl+K) and invokes the supplied
 * callback when it fires. Ignores repeats by default so holding the key
 * doesn't fire repeatedly. Cleans up on unmount.
 *
 * The combo is described as a plain object so callers don't have to learn a
 * DSL: `{ key: "k", meta: true }` is ⌘K on mac + Ctrl+K on Win/Linux (we
 * treat `meta` and `ctrl` as interchangeable for cross-platform ergonomics).
 *
 * @module @/hooks/use-keyboard-shortcut
 */
import * as React from "react";

export interface KeyboardShortcutCombo {
  /** Lowercased key — e.g. `"k"`, `"b"`, `"/"`. */
  key: string;
  /** Require Cmd (mac) / Ctrl (others). Defaults to `false`. */
  meta?: boolean;
  /** Require Shift. Defaults to `false`. */
  shift?: boolean;
  /** Require Alt / Option. Defaults to `false`. */
  alt?: boolean;
}

export interface UseKeyboardShortcutOptions {
  /** When `true`, the callback fires on every keydown repeat. Defaults to `false`. */
  allowRepeat?: boolean;
  /** When `true`, ignore the shortcut when focus is in a form field. Defaults to `true`. */
  ignoreFormFields?: boolean;
  /** When `true`, call `event.preventDefault()` on a match. Defaults to `true`. */
  preventDefault?: boolean;
}

export function useKeyboardShortcut(
  combo: KeyboardShortcutCombo,
  callback: (event: KeyboardEvent) => void,
  options: UseKeyboardShortcutOptions = {},
): void {
  const {
    allowRepeat = false,
    ignoreFormFields = true,
    preventDefault = true,
  } = options;

  // Keep the latest callback without re-binding the listener.
  const cbRef = React.useRef(callback);
  React.useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    function handler(event: KeyboardEvent) {
      if (!allowRepeat && event.repeat) return;
      if (event.key.toLowerCase() !== combo.key.toLowerCase()) return;
      if (!!combo.meta !== (event.metaKey || event.ctrlKey)) return;
      if (!!combo.shift !== event.shiftKey) return;
      if (!!combo.alt !== event.altKey) return;

      if (ignoreFormFields) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target?.isContentEditable
        ) {
          return;
        }
      }

      if (preventDefault) event.preventDefault();
      cbRef.current(event);
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    combo.key,
    combo.meta,
    combo.shift,
    combo.alt,
    allowRepeat,
    ignoreFormFields,
    preventDefault,
  ]);
}
