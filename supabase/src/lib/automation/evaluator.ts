/**
 * Supa AI — Phase 9A Automation — Condition Evaluator.
 *
 * Evaluates conditional logic embedded in a workflow's `config.conditions`
 * block. Supports two flavors:
 *
 *   - `if/else` — a single boolean expression plus optional `then` /
 *     `else` branch actions.
 *   - `switch` — a value lookup matched against a list of cases.
 *
 * The evaluator is intentionally small — it does not implement a Turing-
 * complete expression language. Complex branching belongs in dedicated
 * action handlers (e.g. `transform`, `filter`).
 *
 * Server-only: part of the execution path.
 *
 * @module @/lib/automation/evaluator
 */
import "server-only";

/** Operators supported by {@link ConditionEvaluator.evaluate}. */
export type ConditionOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notNull"
  | "isNull"
  | "truthy"
  | "falsy";

/** A single comparison expression. */
export interface ConditionExpression {
  /** Operator. */
  op: ConditionOperator;
  /** Left-hand value (already resolved — call VariableResolver first). */
  left: unknown;
  /** Right-hand value (ignored for unary operators). */
  right?: unknown;
}

/** A logical combination of conditions. */
export interface ConditionGroup {
  /** `and` (default) or `or`. */
  combinator?: "and" | "or";
  /** Sub-conditions — each may itself be a group. */
  conditions: Array<ConditionExpression | ConditionGroup>;
  /** Negate the whole group when `true`. */
  not?: boolean;
}

/** A `switch` case clause. */
export interface SwitchCase {
  /** Value to match (deep equality). */
  value: unknown;
  /** Branch label — the executor picks this case when `value` matches. */
  branch: string;
}

/** A `switch` block. */
export interface SwitchBlock {
  kind: "switch";
  /** The value to switch on (already resolved). */
  on: unknown;
  /** Cases. */
  cases: SwitchCase[];
  /** Default branch when no case matches. */
  default?: string;
}

/** A single `if/else` block. */
export interface IfElseBlock {
  kind: "if";
  /** The condition (group or single expression). */
  condition: ConditionExpression | ConditionGroup;
  /** Branch taken when the condition is true. */
  then: string;
  /** Branch taken when the condition is false. */
  else?: string;
}

/** Top-level condition config accepted by the evaluator. */
export type ConditionBlock = IfElseBlock | SwitchBlock;

/**
 * Compare two values with the given operator. Returns `true` when the
 * comparison holds.
 */
function compare(op: ConditionOperator, left: unknown, right: unknown): boolean {
  switch (op) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "gt":
      return (left as number) > (right as number);
    case "gte":
      return (left as number) >= (right as number);
    case "lt":
      return (left as number) < (right as number);
    case "lte":
      return (left as number) <= (right as number);
    case "contains":
      if (typeof left === "string" && typeof right === "string") {
        return left.includes(right);
      }
      if (Array.isArray(left)) {
        return left.some((v) => v === right);
      }
      if (left !== null && typeof left === "object") {
        const key = typeof right === "string" || typeof right === "number" || typeof right === "symbol"
          ? right
          : String(right);
        return key in (left as Record<string, unknown>);
      }
      return false;
    case "startsWith":
      return typeof left === "string" && typeof right === "string" && left.startsWith(right);
    case "endsWith":
      return typeof left === "string" && typeof right === "string" && left.endsWith(right);
    case "in":
      return Array.isArray(right) && right.some((v) => v === left);
    case "notNull":
      return left !== null && left !== undefined;
    case "isNull":
      return left === null || left === undefined;
    case "truthy":
      return Boolean(left);
    case "falsy":
      return !left;
    default:
      return false;
  }
}

/**
 * Evaluate a single expression (or group) to a boolean.
 */
function evaluateCondition(node: ConditionExpression | ConditionGroup): boolean {
  if ("op" in node) {
    return compare(node.op, node.left, node.right);
  }
  const combinator = node.combinator ?? "and";
  const results = node.conditions.map((c) => evaluateCondition(c));
  const combined = combinator === "or" ? results.some(Boolean) : results.every(Boolean);
  return node.not ? !combined : combined;
}

/**
 * Deep-equality check (used by `switch` cases).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
}

/**
 * Condition evaluator singleton.
 */
export class ConditionEvaluator {
  /**
   * Evaluate an `if/else` block. Returns the selected branch label
   * (`then` or `else`). When `else` is omitted and the condition is
   * false, returns `null` (i.e. "no branch taken").
   */
  evaluateIf(block: IfElseBlock): string | null {
    return evaluateCondition(block.condition) ? block.then : (block.else ?? null);
  }

  /**
   * Evaluate a `switch` block. Returns the selected case's `branch`
   * label, or `default` when no case matches (and `default` is set),
   * or `null` otherwise.
   */
  evaluateSwitch(block: SwitchBlock): string | null {
    for (const c of block.cases) {
      if (deepEqual(block.on, c.value)) return c.branch;
    }
    return block.default ?? null;
  }

  /**
   * Evaluate any {@link ConditionBlock}. Returns the selected branch
   * label or `null` when no branch is taken.
   */
  evaluate(block: ConditionBlock): string | null {
    if (block.kind === "if") return this.evaluateIf(block);
    return this.evaluateSwitch(block);
  }
}

/** Singleton evaluator — stateless, safe to share across requests. */
export const conditionEvaluator = new ConditionEvaluator();
