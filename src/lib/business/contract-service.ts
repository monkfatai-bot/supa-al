/**
 * Supa AI — Phase 10 contract service (server-only).
 *
 * Owns the `contracts` table — binding agreements with customers.
 * CRUD + `sign` (sets status to `signed` + stamps `signed_at`).
 *
 * @module @/lib/business/contract-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  Contract,
  CreateContractInput,
  UpdateContractInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class ContractService {
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
  ): Promise<Contract[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("contracts")
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
      if (error) throw toDbError(error, "contracts.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing contracts.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    contractId: string,
  ): Promise<Contract> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("contracts")
        .select()
        .eq("id", contractId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "contracts.get failed");
      if (!data) throw new NotFoundError("Contract", contractId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching contract.", {
        contractId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateContractInput,
  ): Promise<Contract> {
    const title = input.title?.trim();
    if (!title) throw new ValidationError("Contract title is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("contracts")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          title,
          content: input.content ?? null,
          status: input.status ?? "draft",
          start_date: input.startDate ?? null,
          end_date: input.endDate ?? null,
          value: input.value ?? 0,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "contracts.create failed");
      if (!data) throw new NotFoundError("Contract create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating contract.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    contractId: string,
    input: UpdateContractInput,
  ): Promise<Contract> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.title !== undefined) patch.title = input.title;
    if (input.content !== undefined) patch.content = input.content;
    if (input.status !== undefined) patch.status = input.status;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate;
    if (input.value !== undefined) patch.value = input.value;
    if (input.signedAt !== undefined) patch.signed_at = input.signedAt;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("contracts")
        .update(patch as never)
        .eq("id", contractId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "contracts.update failed");
      if (!data) throw new NotFoundError("Contract", contractId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating contract.", {
        contractId,
      });
    }
  }

  /** Mark a contract as signed + stamp `signed_at`. */
  async sign(
    workspaceId: string,
    userId: string,
    contractId: string,
    signedAt: string = new Date().toISOString(),
  ): Promise<Contract> {
    return this.update(workspaceId, userId, contractId, {
      status: "signed",
      signedAt,
    });
  }

  async delete(
    workspaceId: string,
    userId: string,
    contractId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("contracts")
        .delete()
        .eq("id", contractId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "contracts.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting contract.", {
        contractId,
      });
    }
  }
}

export async function createContractService(): Promise<ContractService> {
  const supabase = await createSupabaseServerClient();
  return new ContractService(supabase);
}
