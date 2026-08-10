/**
 * Structured logger for server-side code.
 * In development, everything is printed to stdout.
 * In production, you can replace the implementation with
 * a third-party service (Datadog, Sentry, etc.).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  message: string;
  context?: string;
  [key: string]: unknown;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function emit(payload: LogPayload): void {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, ...payload };

  if (isDev()) {
    const color = {
      debug: "\x1b[36m",
      info: "\x1b[32m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    }[payload.level];
    const reset = "\x1b[0m";
    console.log(
      `${color}[${payload.level.toUpperCase()}]${reset} ${timestamp} — ${payload.message}`,
      payload.context ? `(${payload.context})` : "",
      Object.keys(payload).length > 3
        ? JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([k]) => !["level", "message", "context", "timestamp"].includes(k))), null, 2)
        : ""
    );
    return;
  }

  // Production: structured JSON — ready for log aggregators.
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug(message: string, extra?: Record<string, unknown>) {
    emit({ level: "debug", message, ...extra });
  },
  info(message: string, extra?: Record<string, unknown>) {
    emit({ level: "info", message, ...extra });
  },
  warn(message: string, extra?: Record<string, unknown>) {
    emit({ level: "warn", message, ...extra });
  },
  error(message: string, extra?: Record<string, unknown>) {
    emit({ level: "error", message, ...extra });
  },
} as const;
