/**
 * Supa AI — Phase 9A Automation — Variable Resolver.
 *
 * Resolves `{{variable}}` placeholders inside string config values. Used
 * by {@link WorkflowExecutor} before each action runs so that an action's
 * config (e.g. `to`, `subject`, `body`) can reference variables from
 * the workflow's `workflow_variables` table, the trigger payload, and
 * the outputs of previous actions.
 *
 * Supported syntax:
 *
 *   - `{{key}}`          — plain key lookup in the resolved scope.
 *   - `{{a.b.c}}`        — dotted path into nested objects.
 *   - `{{outputs.2.x}}`  — output of action #2 (keyed by `order`).
 *   - `{{payload.event}}`— the trigger payload's `event` field.
 *
 * When a placeholder cannot be resolved, it is left in place (so the
 * resulting string is visibly broken rather than silently `undefined`).
 *
 * Server-only: this module imports `@/lib/automation/executor` via the
 * server barrel indirectly through types. The resolver itself has no
 * side effects but is part of the server execution path.
 *
 * @module @/lib/automation/resolver
 */
import "server-only";

/** Shape of the scope passed to {@link VariableResolver.resolve}. */
export interface ResolveScope {
  /** Workflow variables (already merged with defaults). */
  variables?: Record<string, unknown>;
  /** Trigger payload. */
  payload?: Record<string, unknown>;
  /** Outputs of previous actions, keyed by action order. */
  outputs?: Record<number, unknown>;
}

/** Match `{{...}}` placeholders. */
const PLACEHOLDER_RE = /\{\{\s*([\w.\-]+)\s*\}\}/g;

/**
 * Walk a dotted path through a value. Returns `undefined` when any
 * intermediate is `null`/`undefined` or when the path cannot be resolved.
 */
function lookup(root: unknown, path: string): unknown {
  if (root === null || root === undefined) return undefined;
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const idx = Number(part);
      if (!Number.isFinite(idx)) return undefined;
      current = current[idx];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

/**
 * Resolver singleton. Methods are pure — they don't touch the DB, so the
 * class is cheap and stateless.
 */
export class VariableResolver {
  /**
   * Resolve every `{{...}}` placeholder in `input`. When `input` is a
   * string, returns the interpolated string. When `input` is a non-string
   * primitive, returns it untouched. When `input` is an array or object,
   * returns a deep-cloned copy with placeholders resolved in every leaf
   * string value.
   */
  resolve<T>(input: T, scope: ResolveScope): T {
    if (typeof input === "string") {
      return this.resolveString(input, scope) as unknown as T;
    }
    if (Array.isArray(input)) {
      return input.map((v) => this.resolve(v, scope)) as unknown as T;
    }
    if (input !== null && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = this.resolve(v, scope);
      }
      return out as unknown as T;
    }
    return input;
  }

  /**
   * Resolve placeholders in a single string. Unknown placeholders are
   * left in place so the consumer can detect (and log) them.
   */
  resolveString(input: string, scope: ResolveScope): string {
    return input.replace(PLACEHOLDER_RE, (full, key: string) => {
      const value = this.lookupKey(key, scope);
      if (value === undefined || value === null) return full;
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return full;
      }
    });
  }

  /**
   * Look up a single placeholder key against the scope. Tries the
   * `outputs`, `payload`, and `variables` roots in order. Returns
   * `undefined` when no root matches.
   */
  lookupKey(key: string, scope: ResolveScope): unknown {
    if (key.startsWith("outputs.")) {
      return lookup(scope.outputs, key.slice("outputs.".length));
    }
    if (key.startsWith("payload.")) {
      return lookup(scope.payload, key.slice("payload.".length));
    }
    if (key.startsWith("variables.")) {
      return lookup(scope.variables, key.slice("variables.".length));
    }
    // Bare key — try payload first (most common), then variables.
    const fromPayload = lookup(scope.payload, key);
    if (fromPayload !== undefined) return fromPayload;
    return lookup(scope.variables, key);
  }
}

/** Singleton resolver — stateless, safe to share across requests. */
export const variableResolver = new VariableResolver();
