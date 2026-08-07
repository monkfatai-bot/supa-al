/**
 * Supa AI — Phase 10 CRM service (server-only).
 *
 * Owns the four CRM tables: `customers`, `contacts`, `leads`,
 * `opportunities`. Each domain lives in its own service class so callers
 * can request exactly the surface they need (the API layer rarely wants
 * to mix them).
 *
 * Construction: the server Supabase client (RLS-enforced). The
 * `assertMember` / `assertCanWrite` helpers gate every mutation; RLS on
 * the underlying tables is the second line of defense.
 *
 * @module @/lib/business/crm-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  Contact,
  CreateContactInput,
  CreateCustomerInput,
  CreateLeadInput,
  CreateOpportunityInput,
  Customer,
  Lead,
  ListContactsOptions,
  ListCustomersOptions,
  Opportunity,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateLeadInput,
  UpdateOpportunityInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

// ---------------------------------------------------------------------------
// CustomerService
// ---------------------------------------------------------------------------

/** Server-only service for the `customers` table. */
export class CustomerService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: ListCustomersOptions = {},
  ): Promise<Customer[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("customers")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.customerType) query = query.eq("customer_type", opts.customerType);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "customers.list failed");
      return data ?? [];
    } catch (err) {
      if (
        err instanceof NotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing customers.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    customerId: string,
  ): Promise<Customer> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("customers")
        .select()
        .eq("id", customerId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "customers.get failed");
      if (!data) throw new NotFoundError("Customer", customerId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching customer.", {
        customerId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateCustomerInput,
  ): Promise<Customer> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Customer name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("customers")
        .insert({
          workspace_id: workspaceId,
          name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          company: input.company ?? null,
          status: input.status ?? "active",
          customer_type: input.customerType ?? "individual",
          tags: input.tags ?? [],
          avatar_url: input.avatarUrl ?? null,
          address: (input.address ?? null) as never,
          metadata: (input.metadata ?? null) as never,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "customers.create failed");
      if (!data) throw new NotFoundError("Customer create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating customer.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<Customer> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new ValidationError("Customer name cannot be empty.");
      patch.name = trimmed;
    }
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.company !== undefined) patch.company = input.company;
    if (input.status !== undefined) patch.status = input.status;
    if (input.customerType !== undefined) patch.customer_type = input.customerType;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
    if (input.address !== undefined) patch.address = input.address as never;
    if (input.metadata !== undefined) patch.metadata = input.metadata as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("customers")
        .update(patch as never)
        .eq("id", customerId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "customers.update failed");
      if (!data) throw new NotFoundError("Customer", customerId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating customer.", {
        customerId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    customerId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("customers")
        .delete()
        .eq("id", customerId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "customers.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting customer.", {
        customerId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// ContactService
// ---------------------------------------------------------------------------

/** Server-only service for the `contacts` table. */
export class ContactService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: ListContactsOptions = {},
  ): Promise<Contact[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("contacts")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.customerId) query = query.eq("customer_id", opts.customerId);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "contacts.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing contacts.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    contactId: string,
  ): Promise<Contact> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("contacts")
        .select()
        .eq("id", contactId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "contacts.get failed");
      if (!data) throw new NotFoundError("Contact", contactId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching contact.", {
        contactId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateContactInput,
  ): Promise<Contact> {
    const firstName = input.firstName?.trim();
    if (!firstName) throw new ValidationError("Contact first name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("contacts")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          first_name: firstName,
          last_name: input.lastName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          title: input.title ?? null,
          department: input.department ?? null,
          is_primary: input.isPrimary ?? false,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "contacts.create failed");
      if (!data) throw new NotFoundError("Contact create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating contact.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    contactId: string,
    input: UpdateContactInput,
  ): Promise<Contact> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.firstName !== undefined) patch.first_name = input.firstName;
    if (input.lastName !== undefined) patch.last_name = input.lastName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.title !== undefined) patch.title = input.title;
    if (input.department !== undefined) patch.department = input.department;
    if (input.isPrimary !== undefined) patch.is_primary = input.isPrimary;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("contacts")
        .update(patch as never)
        .eq("id", contactId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "contacts.update failed");
      if (!data) throw new NotFoundError("Contact", contactId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating contact.", {
        contactId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    contactId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("contacts")
        .delete()
        .eq("id", contactId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "contacts.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting contact.", {
        contactId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// LeadService
// ---------------------------------------------------------------------------

/** Server-only service for the `leads` table. */
export class LeadService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      source?: string;
      assignedTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Lead[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("leads")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.source) query = query.eq("source", opts.source);
      if (opts.assignedTo) query = query.eq("assigned_to", opts.assignedTo);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "leads.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing leads.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    leadId: string,
  ): Promise<Lead> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("leads")
        .select()
        .eq("id", leadId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "leads.get failed");
      if (!data) throw new NotFoundError("Lead", leadId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching lead.", {
        leadId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateLeadInput,
  ): Promise<Lead> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Lead name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          company: input.company ?? null,
          source: input.source ?? "manual",
          status: input.status ?? "new",
          score: input.score ?? 0,
          assigned_to: input.assignedTo ?? null,
          metadata: (input.metadata ?? null) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "leads.create failed");
      if (!data) throw new NotFoundError("Lead create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating lead.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    leadId: string,
    input: UpdateLeadInput,
  ): Promise<Lead> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new ValidationError("Lead name cannot be empty.");
      patch.name = trimmed;
    }
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.company !== undefined) patch.company = input.company;
    if (input.source !== undefined) patch.source = input.source;
    if (input.status !== undefined) patch.status = input.status;
    if (input.score !== undefined) patch.score = input.score;
    if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
    if (input.convertedToCustomerId !== undefined) {
      patch.converted_to_customer_id = input.convertedToCustomerId;
    }
    if (input.metadata !== undefined) patch.metadata = input.metadata as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("leads")
        .update(patch as never)
        .eq("id", leadId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "leads.update failed");
      if (!data) throw new NotFoundError("Lead", leadId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating lead.", {
        leadId,
      });
    }
  }

  /** Mark a lead as won + link the converted customer record. */
  async convert(
    workspaceId: string,
    userId: string,
    leadId: string,
    customerId: string,
  ): Promise<Lead> {
    return this.update(workspaceId, userId, leadId, {
      status: "won",
      convertedToCustomerId: customerId,
    });
  }

  async delete(
    workspaceId: string,
    userId: string,
    leadId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("leads")
        .delete()
        .eq("id", leadId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "leads.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting lead.", {
        leadId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// OpportunityService
// ---------------------------------------------------------------------------

/** Server-only service for the `opportunities` table. */
export class OpportunityService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      stage?: string;
      customerId?: string;
      assignedTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Opportunity[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("opportunities")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.stage) query = query.eq("stage", opts.stage);
      if (opts.customerId) query = query.eq("customer_id", opts.customerId);
      if (opts.assignedTo) query = query.eq("assigned_to", opts.assignedTo);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "opportunities.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing opportunities.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    opportunityId: string,
  ): Promise<Opportunity> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("opportunities")
        .select()
        .eq("id", opportunityId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "opportunities.get failed");
      if (!data) throw new NotFoundError("Opportunity", opportunityId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching opportunity.", {
        opportunityId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateOpportunityInput,
  ): Promise<Opportunity> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Opportunity name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("opportunities")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          lead_id: input.leadId ?? null,
          name,
          amount: input.amount ?? 0,
          stage: input.stage ?? "prospecting",
          probability: input.probability ?? 0,
          expected_close_date: input.expectedCloseDate ?? null,
          assigned_to: input.assignedTo ?? null,
          metadata: (input.metadata ?? null) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "opportunities.create failed");
      if (!data) throw new NotFoundError("Opportunity create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating opportunity.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    opportunityId: string,
    input: UpdateOpportunityInput,
  ): Promise<Opportunity> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.leadId !== undefined) patch.lead_id = input.leadId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.stage !== undefined) patch.stage = input.stage;
    if (input.probability !== undefined) patch.probability = input.probability;
    if (input.expectedCloseDate !== undefined) {
      patch.expected_close_date = input.expectedCloseDate;
    }
    if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
    if (input.metadata !== undefined) patch.metadata = input.metadata as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("opportunities")
        .update(patch as never)
        .eq("id", opportunityId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "opportunities.update failed");
      if (!data) throw new NotFoundError("Opportunity", opportunityId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating opportunity.", {
        opportunityId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    opportunityId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("opportunities")
        .delete()
        .eq("id", opportunityId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "opportunities.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting opportunity.", {
        opportunityId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factory helpers — construct with the per-request server client.
// ---------------------------------------------------------------------------

export async function createCustomerService(): Promise<CustomerService> {
  const supabase = await createSupabaseServerClient();
  return new CustomerService(supabase);
}

export async function createContactService(): Promise<ContactService> {
  const supabase = await createSupabaseServerClient();
  return new ContactService(supabase);
}

export async function createLeadService(): Promise<LeadService> {
  const supabase = await createSupabaseServerClient();
  return new LeadService(supabase);
}

export async function createOpportunityService(): Promise<OpportunityService> {
  const supabase = await createSupabaseServerClient();
  return new OpportunityService(supabase);
}
