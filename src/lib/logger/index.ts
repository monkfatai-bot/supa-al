/**
 * Supa AI — Structured logger.
 *
 * A small, dependency-free structured logger with leveled severity, request
 * scoping, and JSON output in production / pretty output in development.
 * Reads `NODE_ENV` directly (not the `env` config) to avoid a circular
 * dependency at boot — config validation itself may want to log.
 *
 * Pluggable sinks let future phases ship logs to Datadog/Logtail/Sentry
 * without touching call sites.
 *
 * @module @/lib/logger
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const DEFAULT_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "info" : "debug";

/** Serializable log context. */
export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  requestId?: string;
  userId?: string;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

/** Default console sink. Pretty in dev, JSON in production. */
class ConsoleSink implements LogSink {
  write(entry: LogEntry): void {
    if (process.env.NODE_ENV === "production") {
      // Single-line JSON for log aggregators. `console.log` works in both
      // the Node.js and Edge runtimes (unlike `process.stdout`).
      console.log(JSON.stringify(entry));
      return;
    }
    const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase().padEnd(5)}`;
    const ctx =
      Object.keys(entry.context).length > 0
        ? ` ${JSON.stringify(entry.context)}`
        : "";
    const scope =
      entry.requestId != null ? ` <req:${entry.requestId}>` : "";
    const user = entry.userId != null ? ` <user:${entry.userId}>` : "";
    const line = `${prefix}${scope}${user} ${entry.message}${ctx}`;
    // Route by severity via `console.*` (runtime-agnostic).
    if (entry.level === "error" || entry.level === "fatal") {
      console.error(line);
    } else if (entry.level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

class Logger {
  private level: LogLevel = DEFAULT_LEVEL;
  private sinks: LogSink[] = [new ConsoleSink()];
  private baseContext: LogContext = {};

  /** Add an additional sink (e.g. Sentry, Datadog). */
  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Create a child logger with merged context (e.g. requestId, userId). */
  child(context: LogContext): Logger {
    const child = new Logger();
    child.level = this.level;
    child.sinks = this.sinks;
    child.baseContext = { ...this.baseContext, ...context };
    return child;
  }

  debug(message: string, context: LogContext = {}): void {
    this.emit("debug", message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.emit("info", message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.emit("warn", message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.emit("error", message, context);
  }

  fatal(message: string, context: LogContext = {}): void {
    this.emit("fatal", message, context);
  }

  private emit(level: LogLevel, message: string, context: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.baseContext, ...context },
    };
    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch {
        // A failing sink must never crash the app.
      }
    }
  }
}

/** Root application logger. Import this everywhere. */
export const logger = new Logger();

/**
 * Create a request-scoped logger. Use in API routes / Server Actions:
 *
 * ```ts
 * const log = createRequestLogger({ requestId, userId });
 * log.info("processing payment", { amount });
 * ```
 */
export function createRequestLogger(context: LogContext): Logger {
  return logger.child(context);
}
