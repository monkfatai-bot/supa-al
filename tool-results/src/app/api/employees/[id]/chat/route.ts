/**
 * Supa AI — Phase 9C employee chat route.
 *
 * POST `/api/employees/:id/chat` — chat with an AI employee. The
 * service builds a system prompt from the employee's `system_prompt`
 * + relevant memory + skills, calls `ai.chat()`, records the usage in
 * `employee_performance`, and returns the assistant's response.
 *
 * Throws `ConfigurationError` (500) when no AI provider is configured.
 * Throws `NotFoundError` (404) when the employee id does not exist.
 * Throws `ValidationError` (400) when the message is empty or the
 * employee is archived.
 *
 * @module @/app/api/employees/[id]/chat/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { employeeChatSchema } from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const input = validateInput(employeeChatSchema, await req.json());

    const service = createEmployeeService();
    const result = await service.chat(id, input.message, user.id);
    return apiSuccess({ result });
  } catch (err) {
    return apiError(err);
  }
}
