import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getCommunicationBus } from "@/lib/runtime";
import { validateInput } from "@/lib/validation";
import { sendMessageSchema } from "@/lib/validation/runtime";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:read");
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new Error("workspaceId is required");
    const bus = getCommunicationBus();
    const messages = await bus.listMessages({
      workspace_id: workspaceId,
      user_id: user.id,
      session_id: url.searchParams.get("session_id") ?? undefined,
      channel: url.searchParams.get("channel") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    return apiSuccess({ messages });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const input = validateInput(sendMessageSchema, await req.json());
    const bus = getCommunicationBus();
    if (input.message_type === "direct" && input.to_agent_id) {
      const message = await bus.sendDirectMessage({
        workspace_id: input.workspace_id,
        user_id: user.id,
        session_id: input.session_id,
        from_agent_id: input.from_agent_id,
        to_agent_id: input.to_agent_id,
        subject: input.subject,
        body: input.body,
        context_transfer: input.context_transfer,
      });
      return apiSuccess({ message });
    }
    if (input.message_type === "broadcast") {
      const message = await bus.broadcast({
        workspace_id: input.workspace_id,
        user_id: user.id,
        session_id: input.session_id,
        from_agent_id: input.from_agent_id,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
        context_transfer: input.context_transfer,
      });
      return apiSuccess({ message });
    }
    // publish
    const message = await bus.publish({
      workspace_id: input.workspace_id,
      user_id: user.id,
      session_id: input.session_id,
      from_agent_id: input.from_agent_id,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      context_transfer: input.context_transfer,
    });
    return apiSuccess({ message });
  } catch (err) {
    return apiError(err);
  }
}
