/**
 * Condition evaluation system for the automation engine.
 * Supports all operators defined in the ConditionOperator type.
 */

import type { Condition, ConditionGroup } from "./types";

/**
 * Resolve a variable reference from context.
 * Supports dot notation for nested objects.
 */
function resolveValue(
  ref: string,
  variables: Record<string, unknown>,
): unknown {
  if (!ref.includes(".")) {
    return variables[ref];
  }

  const parts = ref.split(".");
  let current: unknown = variables;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a single condition against the current variable context.
 */
export function evaluateSingleCondition(
  condition: Condition,
  variables: Record<string, unknown>,
): boolean {
  const { operator, left, right } = condition;
  const leftValue = resolveValue(left, variables);

  switch (operator) {
    case "equals":
      if (typeof leftValue === "string" && typeof right === "string") {
        return leftValue === right;
      }
      if (typeof leftValue === "number" && typeof right === "number") {
        return leftValue === right;
      }
      if (typeof leftValue === "boolean" && typeof right === "boolean") {
        return leftValue === right;
      }
      return leftValue === right;

    case "not_equals":
      if (typeof leftValue === "string" && typeof right === "string") {
        return leftValue !== right;
      }
      if (typeof leftValue === "number" && typeof right === "number") {
        return leftValue !== right;
      }
      if (typeof leftValue === "boolean" && typeof right === "boolean") {
        return leftValue !== right;
      }
      return leftValue !== right;

    case "contains":
      if (typeof leftValue === "string" && typeof right === "string") {
        return leftValue.includes(right);
      }
      if (Array.isArray(leftValue)) {
        return leftValue.includes(right);
      }
      return false;

    case "not_contains":
      if (typeof leftValue === "string" && typeof right === "string") {
        return !leftValue.includes(right);
      }
      if (Array.isArray(leftValue)) {
        return !leftValue.includes(right);
      }
      return true;

    case "greater_than":
      return typeof leftValue === "number" && typeof right === "number" && leftValue > right;

    case "less_than":
      return typeof leftValue === "number" && typeof right === "number" && leftValue < right;

    case "greater_than_or_equal":
      return typeof leftValue === "number" && typeof right === "number" && leftValue >= right;

    case "less_than_or_equal":
      return typeof leftValue === "number" && typeof right === "number" && leftValue <= right;

    case "is_empty":
      return leftValue === undefined || leftValue === null || leftValue === "" ||
        (Array.isArray(leftValue) && leftValue.length === 0);

    case "is_not_empty":
      return leftValue !== undefined && leftValue !== null && leftValue !== "" &&
        !(Array.isArray(leftValue) && leftValue.length === 0);

    case "exists":
      return resolveValue(left, variables) !== undefined;

    case "not_exists":
      return resolveValue(left, variables) === undefined;

    case "starts_with":
      return typeof leftValue === "string" && typeof right === "string" && leftValue.startsWith(right);

    case "ends_with":
      return typeof leftValue === "string" && typeof right === "string" && leftValue.endsWith(right);

    case "is_boolean":
      return typeof leftValue === "boolean";

    case "is_true":
      return leftValue === true;

    case "is_false":
      return leftValue === false;

    default:
      return false;
  }
}

/**
 * Evaluate a condition group with AND/OR logic.
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  variables: Record<string, unknown>,
): boolean {
  if (!group.conditions || group.conditions.length === 0) return true;

  const logic = group.logic ?? "and";

  return logic === "and"
    ? group.conditions.every((c) => evaluateSingleCondition(c, variables))
    : group.conditions.some((c) => evaluateSingleCondition(c, variables));
}

/**
 * Evaluate a condition that can be either a single condition or a group.
 */
export function evaluateCondition(
  condition: unknown,
  variables: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  const cond = condition as Record<string, unknown>;

  // If it has a 'conditions' array, it's a group
  if (Array.isArray(cond.conditions)) {
    return evaluateConditionGroup(cond as unknown as ConditionGroup, variables);
  }

  // If it has an 'operator', it's a single condition
  if (cond.operator) {
    return evaluateSingleCondition(cond as unknown as Condition, variables);
  }

  return true;
}