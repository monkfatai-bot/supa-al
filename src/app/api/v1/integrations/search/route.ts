import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { searchMarketplace } from "@/services/marketplace/actions";
import { listIntegrations } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";
import type { MarketplaceItemType } from "@/types/generated/database";

const itemTypeValues = [
  "ai_employee",
  "workflow_template",
  "business_template",
  "prompt_pack",
  "node_pack",
  "integration_pack",
  "extension",
] as const;

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  type: z.enum(itemTypeValues).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = searchQuerySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { q, category, type, limit } = parsed.data;

    // Search marketplace and integrations in parallel
    const [marketplaceResults, integrationResults] = await Promise.all([
      searchMarketplace({
        query: q,
        category,
        type: type as MarketplaceItemType | undefined,
        limit,
      }),
      listIntegrations({ workspaceId: auth.workspaceId }),
    ]);

    // Filter integrations by search term
    const query = q.toLowerCase();
    const filteredIntegrations = (integrationResults.data ?? []).filter(
      (integration) =>
        integration.name?.toLowerCase().includes(query) ||
        (integration.description ?? "").toLowerCase().includes(query)
    );

    return NextResponse.json({
      data: {
        query: q,
        marketplace: marketplaceResults,
        integrations: filteredIntegrations.slice(0, limit),
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/search error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
