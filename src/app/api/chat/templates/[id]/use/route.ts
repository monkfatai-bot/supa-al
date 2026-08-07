/**
 * Supa AI — Prompt template use (render + increment usage_count) route.
 *
 * POST `/api/chat/templates/:id/use`  — render the template with the
 *   caller-provided variables and atomically bump `usage_count`.
 *
 *   Request body (validated with {@link renderTemplateSchema}):
 *   ```json
 *   { "variables": { "name": "Ada", "code": "1234" } }
 *   ```
 *
 *   Response envelope (success):
 *   ```json
 *   {
 *     "success": true,
 *     "data": {
 *       "template": { ...PromptTemplate },
 *       "rendered": "Hello Ada, your code is 1234.",
 *       "missing": []
 *     }
 *   }
 *   ```
 *
 *   When a required variable is missing, the route returns 400 with a
 *   `VALIDATION_ERROR` whose `details.missing` lists the unresolved names.
 *
 *   The `usage_count` increment is best-effort — if it fails (e.g. the
 *   template is public and RLS forbids the update), the rendered content is
 *   still returned. See {@link PromptTemplateService.incrementUsage}.
 *
 * Requires an authenticated session.
 *
 * @module @/app/api/chat/templates/[id]/use/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import {
  createPromptTemplateService,
  extractVariables,
  renderTemplate,
  type PromptTemplateVariableDescriptor,
} from "@/lib/chat/prompt-template-service";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { renderTemplateSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Coerce a raw JSONB value (from `prompt_templates.variables`) into the
 * typed descriptor array. Mirrors the helper in the service module but is
 * duplicated here so this route can render without leaking the service's
 * private function.
 */
function coerceVariables(raw: unknown): PromptTemplateVariableDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const out: PromptTemplateVariableDescriptor[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "name" in item) {
      const v = item as Record<string, unknown>;
      if (typeof v.name === "string") {
        const descriptor: PromptTemplateVariableDescriptor = { name: v.name };
        if (typeof v.description === "string") {
          descriptor.description = v.description;
        }
        if (typeof v.defaultValue === "string") {
          descriptor.defaultValue = v.defaultValue;
        }
        out.push(descriptor);
      }
    }
  }
  return out;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    const input = validateInput(renderTemplateSchema, await req.json());

    const service = await createPromptTemplateService();
    const template = await service.get(user.id, id);
    if (!template) {
      throw new NotFoundError("Prompt template", id);
    }

    // Render. `renderTemplate` throws ValidationError if a required
    // variable is missing — that propagates through apiError as a 400
    // with `details.missing` populated.
    const declared = coerceVariables(template.variables);
    const rendered = renderTemplate(template.content, input.variables, declared);

    // Best-effort usage-count increment.
    await service.incrementUsage(user.id, id);

    // Surface the declared variable names + any that the template uses
    // but the caller didn't supply (informational — defaults filled them
    // in). Useful for the UI to render a "you used defaults" hint.
    const declaredNames = declared.map((v) => v.name);
    const used = extractVariables(template.content);
    const missingFromCaller = used.filter(
      (n) => !Object.prototype.hasOwnProperty.call(input.variables, n),
    );

    return apiSuccess({
      template,
      rendered,
      variables: {
        declared: declaredNames,
        used,
        missingFromCaller,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
