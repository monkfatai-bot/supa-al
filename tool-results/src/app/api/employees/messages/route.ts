/**
 * Supa AI — Phase 9C inter-employee messages list + send route.
 *
 * GET  `/api/employees/messages`              — list messages
 *                                               (optionally filter
 *                                               by `fromId`/`toId`).
 * POST `/api/employees/messages`              — send a message
 *                                               between two employees.
 *
 * The body for POST must include `fromEmployeeId`, `toEmployeeId`,
 * and the message payload (`content`, optional `messageType`,
 * optional `context`, optional `parentId`). The two employees must
 * belong to the caller's workspace.
 *
 * @module @/app/api/employees/messages/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { ValidationError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import {
  listMessagesQuerySchema,
  sendMessageSchema,
} from "@/lib/validation/employees";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listMessagesQuerySchema, {
      fromId: url.searchParams.get("fromId") ?? undefined,
      toId: url.searchParams.get("toId") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const service = createEmployeeService();
    const messages = await service.listMessages(user.id, query);
    return apiSuccess({ messages });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as {
      fromEmployeeId?: string;
      toEmployeeId?: string;
    } & Record<string, unknown>;
    if (!body.fromEmployeeId || typeof body.fromEmployeeId !== "string") {
      throw new ValidationError("`fromEmployeeId` is required.");
    }
    if (!body.toEmployeeId || typeof body.toEmployeeId !== "string") {
      throw new ValidationError("`toEmployeeId` is required.");
    }

    const input = validateInput(sendMessageSchema, body);

    const service = createEmployeeService();
    const message = await service.sendMessage(
      user.id,
      body.fromEmployeeId,
      body.toEmployeeId,
      input,
    );
    return apiSuccess({ message });
  } catch (err) {
    return apiError(err);
  }
}
