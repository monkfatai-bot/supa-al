/**
 * Supa AI — validation barrel.
 *
 * Re-exports every Zod schema and the two helpers used to apply them:
 *
 * - {@link validateInput} — throws a {@link ValidationError} with field
 *   details on failure (use in API routes / Server Actions).
 * - {@link safeValidate} — returns a {@link Result} instead of throwing
 *   (use when you want to branch on success without try/catch).
 *
 * @module @/lib/validation
 */

import type { z } from "zod";

import type { AppError } from "@/lib/errors";
import { ValidationError } from "@/lib/errors";
import type { Result } from "@/types/common";

export * from "./common";
export * from "./auth";
export * from "./chat";

// NOTE: `./employees` and `./workspace` schemas are intentionally NOT
// re-exported here to avoid naming collisions (e.g. `InviteMemberInput`,
// `UpdateMemberInput`, `createFolderSchema`). Import Phase 9C employee
// schemas directly from `@/lib/validation/employees`, and Phase 9 workspace
// schemas directly from `@/lib/validation/workspace`.

/**
 * Validate `data` against `schema`. On success returns the parsed (and
 * transformed/defaulted) value. On failure throws a {@link ValidationError}
 * whose `details.fields` lists each invalid path + message — safe to
 * surface to clients.
 *
 * @example
 * ```ts
 * const input = validateInput(signUpSchema, body);
 * // input is fully typed as SignUpInput
 * ```
 */
export function validateInput<TOutput>(schema: z.ZodType<TOutput, z.ZodTypeDef, any>, data: unknown): TOutput {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new ValidationError("Input validation failed.", { fields });
  }
  return result.data;
}

/**
 * Non-throwing variant of {@link validateInput}. Returns a {@link Result}
 * whose `error` (when present) is a {@link ValidationError} with field
 * details. Use this in code paths where try/catch would clutter control
 * flow, or when you want to defer error handling to the caller.
 *
 * @example
 * ```ts
 * const result = safeValidate(signUpSchema, body);
 * if (!result.ok) return Response.json({ error: result.error.toJSON() }, { status: 400 });
 * const input = result.value;
 * ```
 */
export function safeValidate<TOutput>(
  schema: z.ZodType<TOutput, z.ZodTypeDef, any>,
  data: unknown,
): Result<TOutput, AppError> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const fields = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return {
    ok: false,
    error: new ValidationError("Input validation failed.", { fields }),
  };
}
