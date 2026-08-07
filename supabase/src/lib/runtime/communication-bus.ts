/**
 * Supa AI — Phase 12 Agent Communication Bus (server-only).
 *
 * Secure internal communication between AI Employees and runtime processes.
 * Supports direct messaging, broadcast, pub/sub, shared workspace channels,
 * event routing, context transfer, and message history.
 *
 * @module @/lib/runtime/communication-bus
 */
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { ValidationError, DatabaseError } from "@/lib/errors";
import { assertMember, toDbError } from "@/lib/workspace/core";
import type { AgentMessage } from "./types";

type MessageHandler = (message: AgentMessage) => void | Promise<void>;

interface ChannelSubscription {
  id: string;
  workspace_id: string;
  channel: string;
  subscriber_id: string;
  handler: MessageHandler;
}

export class AgentCommunicationBus {
  private subscriptions: Map<string, ChannelSubscription> = new Map();
  private counter = 0;

  /**
   * Send a direct message from one agent to another.
   */
  async sendDirectMessage(params: {
    workspace_id: string;
    user_id: string;
    session_id: string;
    from_agent_id: string;
    to_agent_id: string;
    subject: string;
    body: string;
    context_transfer?: Record<string, unknown>;
  }): Promise<AgentMessage> {
    const supabase = createSupabaseAdminClient();
    await assertMember(supabase, params.workspace_id, params.user_id);

    const event = await this.recordMessage({
      workspace_id: params.workspace_id,
      session_id: params.session_id,
      from_agent_id: params.from_agent_id,
      to_agent_id: params.to_agent_id,
      channel: `direct:${params.from_agent_id}:${params.to_agent_id}`,
      message_type: "direct",
      subject: params.subject,
      body: params.body,
      context_transfer: params.context_transfer,
    });

    // Dispatch to in-process subscribers.
    await this.dispatch(event);
    return event;
  }

  /**
   * Broadcast a message to all agents in a session.
   */
  async broadcast(params: {
    workspace_id: string;
    user_id: string;
    session_id: string;
    from_agent_id: string;
    channel: string;
    subject: string;
    body: string;
    context_transfer?: Record<string, unknown>;
  }): Promise<AgentMessage> {
    const supabase = createSupabaseAdminClient();
    await assertMember(supabase, params.workspace_id, params.user_id);

    const event = await this.recordMessage({
      workspace_id: params.workspace_id,
      session_id: params.session_id,
      from_agent_id: params.from_agent_id,
      to_agent_id: null,
      channel: params.channel,
      message_type: "broadcast",
      subject: params.subject,
      body: params.body,
      context_transfer: params.context_transfer,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Publish a message to a pub/sub channel.
   */
  async publish(params: {
    workspace_id: string;
    user_id: string;
    session_id: string;
    from_agent_id: string;
    channel: string;
    subject: string;
    body: string;
    context_transfer?: Record<string, unknown>;
  }): Promise<AgentMessage> {
    const supabase = createSupabaseAdminClient();
    await assertMember(supabase, params.workspace_id, params.user_id);

    const event = await this.recordMessage({
      workspace_id: params.workspace_id,
      session_id: params.session_id,
      from_agent_id: params.from_agent_id,
      to_agent_id: null,
      channel: params.channel,
      message_type: "publish",
      subject: params.subject,
      body: params.body,
      context_transfer: params.context_transfer,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Subscribe to a channel. Returns an unsubscribe function.
   */
  subscribe(params: {
    workspace_id: string;
    channel: string;
    subscriber_id: string;
    handler: MessageHandler;
  }): () => void {
    const id = `sub_${++this.counter}_${Date.now()}`;
    const entry: ChannelSubscription = {
      id,
      workspace_id: params.workspace_id,
      channel: params.channel,
      subscriber_id: params.subscriber_id,
      handler: params.handler,
    };
    this.subscriptions.set(id, entry);
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * List message history for a session/channel.
   */
  async listMessages(opts: {
    workspace_id: string;
    user_id: string;
    session_id?: string;
    channel?: string;
    from_agent_id?: string;
    to_agent_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<AgentMessage[]> {
    const supabase = createSupabaseAdminClient();
    await assertMember(supabase, opts.workspace_id, opts.user_id);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase
      .from("runtime_events")
      .select("*")
      .eq("workspace_id", opts.workspace_id)
      .eq("category", "communication")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts.session_id) query = query.eq("session_id", opts.session_id);
    if (opts.channel) query = query.eq("event_type", `message.${opts.channel}`);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list messages.");
    return ((data ?? []) as any[]).map((e) => ({
      id: e.id,
      session_id: e.session_id,
      from_agent_id: e.payload?.from_agent_id ?? "",
      to_agent_id: e.payload?.to_agent_id ?? null,
      channel: e.payload?.channel ?? "",
      message_type: e.payload?.message_type ?? "direct",
      subject: e.payload?.subject ?? "",
      body: e.payload?.body ?? "",
      context_transfer: e.payload?.context_transfer,
      created_at: e.created_at,
    }));
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async recordMessage(params: {
    workspace_id: string;
    session_id: string;
    from_agent_id: string;
    to_agent_id: string | null;
    channel: string;
    message_type: string;
    subject: string;
    body: string;
    context_transfer?: Record<string, unknown>;
  }): Promise<AgentMessage> {
    const supabase = createSupabaseAdminClient();
    const payload = {
      from_agent_id: params.from_agent_id,
      to_agent_id: params.to_agent_id,
      channel: params.channel,
      message_type: params.message_type,
      subject: params.subject,
      body: params.body,
      context_transfer: params.context_transfer,
    };

    const { data, error } = await supabase.from("runtime_events").insert({
      workspace_id: params.workspace_id,
      session_id: params.session_id,
      event_type: `message.${params.channel}`,
      category: "communication",
      level: "info",
      message: `[${params.message_type}] ${params.subject}`,
      payload: payload as any,
      source: "comm-bus",
    }).select().single();

    if (error) throw toDbError(error, "Failed to record agent message.");

    return {
      id: data.id,
      session_id: params.session_id,
      from_agent_id: params.from_agent_id,
      to_agent_id: params.to_agent_id,
      channel: params.channel,
      message_type: params.message_type as AgentMessage["message_type"],
      subject: params.subject,
      body: params.body,
      context_transfer: params.context_transfer,
      created_at: data.created_at,
    };
  }

  private async dispatch(message: AgentMessage): Promise<void> {
    const matching = Array.from(this.subscriptions.values()).filter((s) => {
      if (s.workspace_id !== message.session_id.split("-")[0]) return false;
      if (s.channel !== message.channel && s.channel !== "*") return false;
      return true;
    });

    for (const sub of matching) {
      try {
        await sub.handler(message);
      } catch (err) {
        logger.warn("comm-bus: handler error", { subId: sub.id, err: String(err) });
      }
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

let _bus: AgentCommunicationBus | null = null;
export function getCommunicationBus(): AgentCommunicationBus {
  if (_bus !== null) return _bus;
  _bus = new AgentCommunicationBus();
  return _bus;
}
