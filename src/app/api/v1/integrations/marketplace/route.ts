import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { listMarketplaceItems, createMarketplaceItem } from "@/services/marketplace/actions";
import { logger } from "@/services/logger";
import type { MarketplaceItemType, MarketplaceItemStatus, PricingType } from "@/types/generated/database";

const itemTypeValues = [
  "ai_employee",
  "workflow_template",
  "business_template",
  "prompt_pack",
  "node_pack",
  "integration_pack",
  "extension",
] as const;

const listQuerySchema = z.object({
  type: z.enum(itemTypeValues).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["published", "draft", "archived", "unlisted"]).optional(),
  sort: z.enum(["rating", "install_count", "created_at", "name"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listQuerySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, category, search, status, sort, limit, offset } = parsed.data;

    const result = await listMarketplaceItems({
      type: type as MarketplaceItemType | undefined,
      category,
      search,
      status: status as MarketplaceItemStatus | undefined,
      sort,
      limit,
      offset,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/marketplace GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

const createItemSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  type: z.enum(itemTypeValues),
  categoryId: z.string().optional(),
  features: z.array(z.string()).optional(),
  pricingType: z.enum(["free", "paid", "freemium", "subscription"]),
  price: z.number().min(0).optional(),
  iconUrl: z.string().url().optional(),
  screenshots: z.array(z.string().url()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, ...itemData } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const result = await createMarketplaceItem({
      workspaceId,
      ...itemData,
      pricingType: itemData.pricingType as PricingType,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/marketplace POST error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
