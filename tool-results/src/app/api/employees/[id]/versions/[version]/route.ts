/**
 * Supa AI — Phase 9C single-version route.
 *
 * GET   `/api/employees/:id/versions/:version` — fetch a single
 *                                                version snapshot.
 * POST  `/api/employees/:id/versions/:version` — restore the
 *                                                employee to the
 *                                                snapshot. The
 *                                                pre-restore state is
 *                                                preserved (the service
 *                                                creates a new version
 *                                                row capturing it).
 *
 * @module @/app/api/employees/[id]/versions/[version]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; version: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, version } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");
    if (!version) throw new NotFoundError("Employee version");

    const service = createEmployeeService();
    const versions = await service.listVersions(id);
    const versionNum = Number(version);
    const match = versions.find((v) => v.version_number === versionNum);
    if (!match) throw new NotFoundError("Employee version", `${id}#${version}`);

    return apiSuccess({ version: match });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, version } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");
    if (!version) throw new NotFoundError("Employee version");

    const versionNum = Number(version);
    if (!Number.isInteger(versionNum) || versionNum < 1) {
      throw new NotFoundError("Employee version", version);
    }

    const service = createEmployeeService();
    const employee = await service.restoreVersion(id, versionNum);
    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}
