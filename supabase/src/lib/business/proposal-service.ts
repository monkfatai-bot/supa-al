/**
 * Supa AI — Phase 10 proposal service (server-only).
 *
 * Owns the `proposals` table — long-form sales documents sent to
 * customers. CRUD + `send` (sets status to `sent` + stamps `sent_at`)
 * + `accept` (sets status to `accepted` + stamps `accepted_at`).
 *
 * @module @/lib/business/proposal-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateProposalInput,
  Proposal,
  UpdateProposalInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class ProposalService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      customerId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Proposal[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("proposals")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.customerId) query = query.eq("customer_id", opts.customerId);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`title.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "proposals.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing proposals.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    proposalId: string,
  ): Promise<Proposal> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("proposals")
        .select()
        .eq("id", proposalId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "proposals.get failed");
      if (!data) throw new NotFoundError("Proposal", proposalId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching proposal.", {
        proposalId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateProposalInput,
  ): Promise<Proposal> {
    const title = input.title?.trim();
    if (!title) throw new ValidationError("Proposal title is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("proposals")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          title,
          content: input.content ?? null,
          status: input.status ?? "draft",
          expired_at: input.expiredAt ?? null,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "proposals.create failed");
      if (!data) throw new NotFoundError("Proposal create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating proposal.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    proposalId: string,
    input: UpdateProposalInput,
  ): Promise<Proposal> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.title !== undefined) patch.title = input.title;
    if (input.content !== undefined) patch.content = input.content;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sentAt !== undefined) patch.sent_at = input.sentAt;
    if (input.acceptedAt !== undefined) patch.accepted_at = input.acceptedAt;
    if (input.expiredAt !== undefined) patch.expired_at = input.expiredAt;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("proposals")
        .update(patch as never)
        .eq("id", proposalId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "proposals.update failed");
      if (!data) throw new NotFoundError("Proposal", proposalId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating proposal.", {
        proposalId,
      });
    }
  }

  /** Mark a proposal as sent + stamp `sent_at`. */
  async send(
    workspaceId: string,
    userId: string,
    proposalId: string,
    sentAt: string = new Date().toISOString(),
  ): Promise<Proposal> {
    return this.update(workspaceId, userId, proposalId, {
      status: "sent",
      sentAt,
    });
  }

  /** Mark a proposal as accepted + stamp `accepted_at`. */
  async accept(
    workspaceId: string,
    userId: string,
    proposalId: string,
    acceptedAt: string = new Date().toISOString(),
  ): Promise<Proposal> {
    return this.update(workspaceId, userId, proposalId, {
      status: "accepted",
      acceptedAt,
    });
  }

  async delete(
    workspaceId: string,
    userId: string,
    proposalId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("proposals")
        .delete()
        .eq("id", proposalId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "proposals.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting proposal.", {
        proposalId,
      });
    }
  }
}

export async function createProposalService(): Promise<ProposalService> {
  const supabase = await createSupabaseServerClient();
  return new ProposalService(supabase);
}
