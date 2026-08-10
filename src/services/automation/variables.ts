/**
 * Variable resolution system for workflow execution.
 * Supports global, local, user, workspace, environment, step_output, and ai_output scopes.
 */

import type { VariableScope, VariableDefinition } from "./types";

/**
 * Resolve all variables for a workflow execution context.
 * Merges variables from multiple scopes in priority order.
 */
export function resolveVariables(
  globalVars: Record<string, unknown>,
  localVars: Record<string, unknown>,
  stepOutputs: Record<string, unknown>,
  userVars?: Record<string, unknown>,
  workspaceVars?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...globalVars,
    ...(workspaceVars ?? {}),
    ...(userVars ?? {}),
    ...localVars,
    ...stepOutputs,
  };
}

/**
 * Apply variable substitution to a string.
 * Replaces {{variable.name}} patterns with resolved values.
 */
export function substituteVariables(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const value = resolveNestedValue(key.trim(), variables);
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

/**
 * Substitute variables in an arbitrary value (object, array, or primitive).
 */
export function substituteInValue(
  value: unknown,
  variables: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    return substituteVariables(value, variables);
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteInValue(item, variables));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substituteInValue(v, variables);
    }
    return result;
  }
  return value;
}

/**
 * Resolve a nested value from an object using dot notation.
 */
export function resolveNestedValue(
  path: string,
  obj: Record<string, unknown>,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Validate that all required variables have values.
 */
export function validateRequiredVariables(
  definitions: VariableDefinition[],
  variables: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const def of definitions) {
    if (def.isRequired) {
      const value = variables[def.name];
      if (value === undefined || value === null || value === "") {
        missing.push(def.name);
      }
    }
  }
  return missing;
}

/**
 * Get a variable's scope-prefixed key for storage.
 */
export function scopeKey(scope: VariableScope, name: string): string {
  return `${scope}:${name}`;
}
