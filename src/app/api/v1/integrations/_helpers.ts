/**
 * Supa AI — Phase 10 Integration Hub — API route helpers.
 *
 * Thin, server-only helpers shared across every
 * `/api/v1/integrations/*` route:
 *
 *   - {@link resolveWorkspaceId} — pull `workspaceId` from the query
 *     string or request body, throwing a {@link ValidationError} when
 *     missing.
 *   - {@link parseJsonBody} — safely parse the request body as JSON,
 *     throwing a {@link ValidationError} on malformed input.
 *
 * Server-only.
 *
 * @module @/app/api/v1/integrations/_helpers
 */
import "server-only";

import type { NextRequest } from "next/server";

import { ValidationError } from "@/lib/errors";

/**
 * Pull `workspaceId` from the request's query string. Throws
 * {@link ValidationError} when absent — every workspace-scoped route
 * requires it.
 */
export function resolveWorkspaceId(req: NextRequest): string {
  const url = new URL(req.url);
  const ws = url.searchParams.get("workspaceId") ?? url.searchParams.get("workspace_id");
  if (!ws || ws.trim().length === 0) {
    throw new ValidationError("`workspaceId` query parameter is required.", {
      field: "workspaceId",
    });
  }
  return ws.trim();
}

/**
 * Parse the request body as JSON. Throws {@link ValidationError} when
 * the body is not valid JSON or is empty.
 */
export async function parseJsonBody(
  req: NextRequest,
): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text || text.trim().length === 0) return {};
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("Request body is not valid JSON.", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Pull a single query param as a string. Returns `null` when absent.
 */
export function getQueryParam(
  req: NextRequest,
  name: string,
): string | null {
  return req.nextUrl.searchParams.get(name);
}

/**
 * Pull + coerce a query param to a number. Returns `undefined` when
 * absent or non-numeric.
 */
export function getQueryNumber(
  req: NextRequest,
  name: string,
): number | undefined {
  const raw = req.nextUrl.searchParams.get(name);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Pull + coerce a query param to a boolean. Returns `undefined` when
 * absent. Treats `"true"` / `"1"` as true, everything else as false.
 */
export function getQueryBoolean(
  req: NextRequest,
  name: string,
): boolean | undefined {
  const raw = req.nextUrl.searchParams.get(name);
  if (raw === null) return undefined;
  return raw === "true" || raw === "1";
}
