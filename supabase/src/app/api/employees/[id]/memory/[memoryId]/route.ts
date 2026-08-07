import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { toAppError } from "@/lib/errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memoryId: string }> },
) {
  try {
    await requireUserId();
    const { memoryId } = await params;
    const body = await request.json();
    const service = await createEmployeeService();
    const memory = await service.updateMemory(memoryId, body);
    return apiSuccess(memory);
  } catch (err) {
    return apiError(toAppError(err));
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memoryId: string }> },
) {
  try {
    await requireUserId();
    const { memoryId } = await params;
    const service = await createEmployeeService();
    await service.deleteMemory(memoryId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(toAppError(err));
  }
}
