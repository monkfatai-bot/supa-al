"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { PAGINATION } from "@/config/constants";
import { env } from "@/config/env";
import type {
  Company,
  Contact,
  Customer,
  Lead,
  Opportunity,
  LeadStatus,
  LeadSource,
  OpportunityStage,
  ActivityAction,
} from "@/types/generated/database";
import type {
  CrmActionResponse,
  PaginatedResponse,
  GetOneResponse,
  CompanyWithContacts,
  CustomerWithCompany,
  LeadWithRelations,
  OpportunityWithRelations,
  PipelineSummary,
  CompanyListOptions,
  ContactListOptions,
  CustomerListOptions,
  LeadListOptions,
  OpportunityListOptions,
  AiLeadScoringResult,
} from "./types";

import { createNotification } from "@/services/notification/actions";
import { verifyWorkspaceMembership, requireMinimumRole } from "@/lib/workspace-utils";

// ── Helpers ──────────────────────────────────────────────────────────────


/**
 * Build a profile map from a list of profile rows.
 */
function buildProfileMap(
  profiles: Array<{ id: string; full_name: string | null; avatar_url: string | null }>,
): Record<string, { full_name: string | null; avatar_url: string | null }> {
  const map: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
  for (const p of profiles) {
    map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
  }
  return map;
}

// ── Companies ────────────────────────────────────────────────────────────

/**
 * Create a new company.
 */
export async function createCompany(
  workspaceId: string,
  data: {
    name: string;
    industry?: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    logo_url?: string;
    notes?: string;
    tags?: string[];
  },
): Promise<CrmActionResponse & { company?: Company }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedName = (data.name ?? "").trim();
  if (!trimmedName) {
    return { success: false, message: "Company name is required.", error: "VALIDATION_ERROR" };
  }

  try {
    const { data: company, error } = await supabase
      .from("companies")
      .insert({
        workspace_id: workspaceId,
        name: trimmedName,
        industry: data.industry ?? "",
        website: data.website ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        address: data.address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        country: data.country ?? "",
        postal_code: data.postal_code ?? "",
        logo_url: data.logo_url ?? "",
        notes: data.notes ?? "",
        tags: data.tags ?? [],
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !company) {
      logger.error("Failed to create company", { workspaceId, reason: error?.message });
      return { success: false, message: "Failed to create company.", error: "CREATE_FAILED" };
    }

    logger.info("Company created", { companyId: company.id, workspaceId });
    await logActivity("company_created" as ActivityAction, `Created company: ${trimmedName}`, {}, workspaceId);
    void createNotification(profile.id, "crm", "New company created", `Company: ${trimmedName}`, "/business");
    revalidatePath("/business");
    return { success: true, message: "Company created.", company };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Company creation error", { workspaceId, reason: message });
    return { success: false, message: "Failed to create company.", error: message };
  }
}

/**
 * Update an existing company.
 */
export async function updateCompany(
  id: string,
  data: Record<string, unknown>,
): Promise<CrmActionResponse & { company?: Company }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("companies")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Company not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: company, error } = await supabase
      .from("companies")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !company) {
      logger.error("Failed to update company", { companyId: id, reason: error?.message });
      return { success: false, message: "Failed to update company.", error: "UPDATE_FAILED" };
    }

    logger.info("Company updated", { companyId: id });
    await logActivity("company_updated" as ActivityAction, `Updated company: ${existing.name}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Company updated.", company };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Company update error", { companyId: id, reason: message });
    return { success: false, message: "Failed to update company.", error: message };
  }
}

/**
 * Delete a company.
 */
export async function deleteCompany(
  id: string,
): Promise<CrmActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("companies")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Company not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { error } = await supabase
      .from("companies")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Failed to delete company", { companyId: id, reason: error.message });
      return { success: false, message: "Failed to delete company.", error: "DELETE_FAILED" };
    }

    logger.info("Company deleted", { companyId: id });
    await logActivity("company_deleted" as ActivityAction, `Deleted company: ${existing.name}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Company deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Company delete error", { companyId: id, reason: message });
    return { success: false, message: "Failed to delete company.", error: message };
  }
}

/**
 * Get a paginated list of companies for a workspace.
 */
export async function getCompanies(
  options: CompanyListOptions,
): Promise<PaginatedResponse<CompanyWithContacts>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(options.workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { workspaceId, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, search } = options;
  const effectivePageSize = Math.min(pageSize, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * effectivePageSize;

  try {
    let query = supabase
      .from("companies")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,industry.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false });
    query = query.range(offset, offset + effectivePageSize - 1);

    const { data: companies, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch companies", { workspaceId, reason: error.message });
      return { success: false, message: "Failed to fetch companies.", error: "FETCH_FAILED" };
    }

    return {
      success: true,
      message: "Companies retrieved.",
      data: (companies ?? []) as CompanyWithContacts[],
      total: count ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Companies fetch error", { workspaceId, reason: message });
    return { success: false, message: "Failed to fetch companies.", error: message };
  }
}

/**
 * Get a single company by ID with its contacts.
 */
export async function getCompany(
  id: string,
): Promise<GetOneResponse<CompanyWithContacts>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !company) {
    return { success: false, message: "Company not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(company.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch contacts for this company
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id);

  return {
    success: true,
    message: "Company retrieved.",
    record: { ...company, contacts: contacts ?? [] },
  };
}

// ── Contacts ─────────────────────────────────────────────────────────────

/**
 * Create a new contact.
 */
export async function createContact(
  workspaceId: string,
  data: {
    first_name: string;
    last_name?: string;
    email?: string;
    phone?: string;
    job_title?: string;
    address?: string;
    notes?: string;
    company_id?: string | null;
    is_primary?: boolean;
    tags?: string[];
  },
): Promise<CrmActionResponse & { contact?: Contact }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedFirstName = (data.first_name ?? "").trim();
  if (!trimmedFirstName) {
    return { success: false, message: "Contact first name is required.", error: "VALIDATION_ERROR" };
  }

  try {
    const { data: contact, error } = await supabase
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        first_name: trimmedFirstName,
        last_name: data.last_name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        job_title: data.job_title ?? "",
        address: data.address ?? "",
        notes: data.notes ?? "",
        company_id: data.company_id ?? null,
        is_primary: data.is_primary ?? false,
        tags: data.tags ?? [],
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !contact) {
      logger.error("Failed to create contact", { workspaceId, reason: error?.message });
      return { success: false, message: "Failed to create contact.", error: "CREATE_FAILED" };
    }

    logger.info("Contact created", { contactId: contact.id, workspaceId });
    await logActivity("contact_created" as ActivityAction, `Created contact: ${trimmedFirstName} ${data.last_name ?? ""}`, {}, workspaceId);
    void createNotification(profile.id, "crm", "New contact created", `Contact: ${trimmedFirstName} ${data.last_name ?? ""}`, "/business");
    revalidatePath("/business");
    return { success: true, message: "Contact created.", contact };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Contact creation error", { workspaceId, reason: message });
    return { success: false, message: "Failed to create contact.", error: message };
  }
}

/**
 * Update an existing contact.
 */
export async function updateContact(
  id: string,
  data: Record<string, unknown>,
): Promise<CrmActionResponse & { contact?: Contact }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("contacts")
    .select("id, workspace_id, first_name, last_name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Contact not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: contact, error } = await supabase
      .from("contacts")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !contact) {
      logger.error("Failed to update contact", { contactId: id, reason: error?.message });
      return { success: false, message: "Failed to update contact.", error: "UPDATE_FAILED" };
    }

    logger.info("Contact updated", { contactId: id });
    await logActivity(
      "contact_updated" as ActivityAction,
      `Updated contact: ${existing.first_name} ${existing.last_name}`,
      {},
      existing.workspace_id,
    );
    revalidatePath("/business");
    return { success: true, message: "Contact updated.", contact };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Contact update error", { contactId: id, reason: message });
    return { success: false, message: "Failed to update contact.", error: message };
  }
}

/**
 * Delete a contact.
 */
export async function deleteContact(
  id: string,
): Promise<CrmActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("contacts")
    .select("id, workspace_id, first_name, last_name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Contact not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Failed to delete contact", { contactId: id, reason: error.message });
      return { success: false, message: "Failed to delete contact.", error: "DELETE_FAILED" };
    }

    logger.info("Contact deleted", { contactId: id });
    await logActivity(
      "contact_deleted" as ActivityAction,
      `Deleted contact: ${existing.first_name} ${existing.last_name}`,
      {},
      existing.workspace_id,
    );
    revalidatePath("/business");
    return { success: true, message: "Contact deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Contact delete error", { contactId: id, reason: message });
    return { success: false, message: "Failed to delete contact.", error: message };
  }
}

/**
 * Get a paginated list of contacts for a workspace.
 */
export async function getContacts(
  options: ContactListOptions,
): Promise<PaginatedResponse<Contact>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(options.workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { workspaceId, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, search, companyId } = options;
  const effectivePageSize = Math.min(pageSize, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * effectivePageSize;

  try {
    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false });
    query = query.range(offset, offset + effectivePageSize - 1);

    const { data: contacts, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch contacts", { workspaceId, reason: error.message });
      return { success: false, message: "Failed to fetch contacts.", error: "FETCH_FAILED" };
    }

    return {
      success: true,
      message: "Contacts retrieved.",
      data: contacts ?? [],
      total: count ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Contacts fetch error", { workspaceId, reason: message });
    return { success: false, message: "Failed to fetch contacts.", error: message };
  }
}

/**
 * Get a single contact by ID.
 */
export async function getContact(
  id: string,
): Promise<GetOneResponse<Contact>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !contact) {
    return { success: false, message: "Contact not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(contact.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  return {
    success: true,
    message: "Contact retrieved.",
    record: contact,
  };
}

// ── Customers ────────────────────────────────────────────────────────────

/**
 * Create a new customer.
 */
export async function createCustomer(
  workspaceId: string,
  data: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    notes?: string;
    company_id?: string | null;
    contact_id?: string | null;
    tags?: string[];
  },
): Promise<CrmActionResponse & { customer?: Customer }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedName = (data.name ?? "").trim();
  if (!trimmedName) {
    return { success: false, message: "Customer name is required.", error: "VALIDATION_ERROR" };
  }

  try {
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        workspace_id: workspaceId,
        name: trimmedName,
        email: data.email ?? "",
        phone: data.phone ?? "",
        address: data.address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        country: data.country ?? "",
        postal_code: data.postal_code ?? "",
        notes: data.notes ?? "",
        company_id: data.company_id ?? null,
        contact_id: data.contact_id ?? null,
        tags: data.tags ?? [],
        customer_since: new Date().toISOString(),
        total_revenue: 0,
        total_invoices: 0,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !customer) {
      logger.error("Failed to create customer", { workspaceId, reason: error?.message });
      return { success: false, message: "Failed to create customer.", error: "CREATE_FAILED" };
    }

    logger.info("Customer created", { customerId: customer.id, workspaceId });
    await logActivity("customer_created" as ActivityAction, `Created customer: ${trimmedName}`, {}, workspaceId);
    void createNotification(profile.id, "crm", "New customer created", `Customer: ${trimmedName}`, "/business");
    revalidatePath("/business");
    return { success: true, message: "Customer created.", customer };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Customer creation error", { workspaceId, reason: message });
    return { success: false, message: "Failed to create customer.", error: message };
  }
}

/**
 * Update an existing customer.
 */
export async function updateCustomer(
  id: string,
  data: Record<string, unknown>,
): Promise<CrmActionResponse & { customer?: Customer }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("customers")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Customer not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: customer, error } = await supabase
      .from("customers")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !customer) {
      logger.error("Failed to update customer", { customerId: id, reason: error?.message });
      return { success: false, message: "Failed to update customer.", error: "UPDATE_FAILED" };
    }

    logger.info("Customer updated", { customerId: id });
    await logActivity("customer_updated" as ActivityAction, `Updated customer: ${existing.name}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Customer updated.", customer };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Customer update error", { customerId: id, reason: message });
    return { success: false, message: "Failed to update customer.", error: message };
  }
}

/**
 * Delete a customer.
 */
export async function deleteCustomer(
  id: string,
): Promise<CrmActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("customers")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Customer not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Failed to delete customer", { customerId: id, reason: error.message });
      return { success: false, message: "Failed to delete customer.", error: "DELETE_FAILED" };
    }

    logger.info("Customer deleted", { customerId: id });
    await logActivity("customer_deleted" as ActivityAction, `Deleted customer: ${existing.name}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Customer deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Customer delete error", { customerId: id, reason: message });
    return { success: false, message: "Failed to delete customer.", error: message };
  }
}

/**
 * Get a paginated list of customers for a workspace.
 */
export async function getCustomers(
  options: CustomerListOptions,
): Promise<PaginatedResponse<CustomerWithCompany>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(options.workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { workspaceId, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, search } = options;
  const effectivePageSize = Math.min(pageSize, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * effectivePageSize;

  try {
    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false });
    query = query.range(offset, offset + effectivePageSize - 1);

    const { data: customers, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch customers", { workspaceId, reason: error.message });
      return { success: false, message: "Failed to fetch customers.", error: "FETCH_FAILED" };
    }

    // Batch-fetch related companies and contacts
    const customerList = customers ?? [];
    const companyIds = [...new Set(customerList.map((c) => c.company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(customerList.map((c) => c.contact_id).filter(Boolean))] as string[];

    const [companiesResult, contactsResult] = await Promise.all([
      companyIds.length > 0
        ? supabase.from("companies").select("id, name, industry, website").in("id", companyIds)
        : Promise.resolve({ data: [] }),
      contactIds.length > 0
        ? supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
        : Promise.resolve({ data: [] }),
    ]);

    const companyMap = new Map((companiesResult.data ?? []).map((c) => [c.id, c]));
    const contactMap = new Map((contactsResult.data ?? []).map((c) => [c.id, c]));

    const enriched: CustomerWithCompany[] = customerList.map((customer) => ({
      ...customer,
      company: companyMap.get(customer.company_id ?? "") ?? undefined,
      contact: contactMap.get(customer.contact_id ?? "") ?? undefined,
    }));

    return {
      success: true,
      message: "Customers retrieved.",
      data: enriched,
      total: count ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Customers fetch error", { workspaceId, reason: message });
    return { success: false, message: "Failed to fetch customers.", error: message };
  }
}

/**
 * Get a single customer by ID with company and contact relations.
 */
export async function getCustomer(
  id: string,
): Promise<GetOneResponse<CustomerWithCompany>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !customer) {
    return { success: false, message: "Customer not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(customer.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch related company and contact
  const [companyResult, contactResult] = await Promise.all([
    customer.company_id
      ? supabase.from("companies").select("*").eq("id", customer.company_id).single()
      : Promise.resolve({ data: null }),
    customer.contact_id
      ? supabase.from("contacts").select("*").eq("id", customer.contact_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    success: true,
    message: "Customer retrieved.",
    record: {
      ...customer,
      company: companyResult.data ?? undefined,
      contact: contactResult.data ?? undefined,
    },
  };
}

// ── Leads ───────────────────────────────────────────────────────────────

/**
 * Create a new lead.
 */
export async function createLead(
  workspaceId: string,
  data: {
    title: string;
    source: LeadSource;
    value?: number;
    description?: string;
    notes?: string;
    tags?: string[];
    company_id?: string | null;
    contact_id?: string | null;
    assigned_to?: string | null;
    expected_close_date?: string | null;
  },
): Promise<CrmActionResponse & { lead?: Lead }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedTitle = (data.title ?? "").trim();
  if (!trimmedTitle) {
    return { success: false, message: "Lead title is required.", error: "VALIDATION_ERROR" };
  }

  try {
    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        workspace_id: workspaceId,
        title: trimmedTitle,
        source: data.source,
        status: "new" as LeadStatus,
        score: 0,
        value: data.value ?? 0,
        description: data.description ?? "",
        notes: data.notes ?? "",
        lost_reason: "",
        tags: data.tags ?? [],
        company_id: data.company_id ?? null,
        contact_id: data.contact_id ?? null,
        assigned_to: data.assigned_to ?? null,
        expected_close_date: data.expected_close_date ?? null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !lead) {
      logger.error("Failed to create lead", { workspaceId, reason: error?.message });
      return { success: false, message: "Failed to create lead.", error: "CREATE_FAILED" };
    }

    logger.info("Lead created", { leadId: lead.id, workspaceId });
    await logActivity("lead_created" as ActivityAction, `Created lead: ${trimmedTitle}`, {}, workspaceId);
    void createNotification(profile.id, "crm", "New lead created", `Lead: ${trimmedTitle}`, "/business");
    revalidatePath("/business");
    return { success: true, message: "Lead created.", lead };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Lead creation error", { workspaceId, reason: message });
    return { success: false, message: "Failed to create lead.", error: message };
  }
}

/**
 * Update an existing lead.
 */
export async function updateLead(
  id: string,
  data: Record<string, unknown>,
): Promise<CrmActionResponse & { lead?: Lead }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Lead not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: lead, error } = await supabase
      .from("leads")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !lead) {
      logger.error("Failed to update lead", { leadId: id, reason: error?.message });
      return { success: false, message: "Failed to update lead.", error: "UPDATE_FAILED" };
    }

    logger.info("Lead updated", { leadId: id });
    await logActivity("lead_updated" as ActivityAction, `Updated lead: ${existing.title}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Lead updated.", lead };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Lead update error", { leadId: id, reason: message });
    return { success: false, message: "Failed to update lead.", error: message };
  }
}

/**
 * Delete a lead.
 */
export async function deleteLead(
  id: string,
): Promise<CrmActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Lead not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Failed to delete lead", { leadId: id, reason: error.message });
      return { success: false, message: "Failed to delete lead.", error: "DELETE_FAILED" };
    }

    logger.info("Lead deleted", { leadId: id });
    await logActivity("lead_deleted" as ActivityAction, `Deleted lead: ${existing.title}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Lead deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Lead delete error", { leadId: id, reason: message });
    return { success: false, message: "Failed to delete lead.", error: message };
  }
}

/**
 * Get a paginated list of leads for a workspace.
 */
export async function getLeads(
  options: LeadListOptions,
): Promise<PaginatedResponse<LeadWithRelations>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(options.workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { workspaceId, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, status, source, assignedTo } = options;
  const effectivePageSize = Math.min(pageSize, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * effectivePageSize;

  try {
    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId);

    if (status) {
      query = query.eq("status", status);
    }
    if (source) {
      query = query.eq("source", source);
    }
    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    query = query.order("created_at", { ascending: false });
    query = query.range(offset, offset + effectivePageSize - 1);

    const { data: leads, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch leads", { workspaceId, reason: error.message });
      return { success: false, message: "Failed to fetch leads.", error: "FETCH_FAILED" };
    }

    // Batch-fetch related entities
    const leadList = leads ?? [];
    const companyIds = [...new Set(leadList.map((l) => l.company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(leadList.map((l) => l.contact_id).filter(Boolean))] as string[];
    const assigneeIds = [...new Set(leadList.map((l) => l.assigned_to).filter(Boolean))] as string[];

    const [companiesResult, contactsResult, assigneesResult] = await Promise.all([
      companyIds.length > 0
        ? supabase.from("companies").select("id, name, industry, website").in("id", companyIds)
        : Promise.resolve({ data: [] }),
      contactIds.length > 0
        ? supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
        : Promise.resolve({ data: [] }),
      assigneeIds.length > 0
        ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", assigneeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const companyMap = new Map((companiesResult.data ?? []).map((c) => [c.id, c]));
    const contactMap = new Map((contactsResult.data ?? []).map((c) => [c.id, c]));
    const profileMap = buildProfileMap(assigneesResult.data ?? []);

    const enriched: LeadWithRelations[] = leadList.map((lead) => ({
      ...lead,
      company: companyMap.get(lead.company_id ?? "") ?? undefined,
      contact: contactMap.get(lead.contact_id ?? "") ?? undefined,
      assignee: profileMap[lead.assigned_to ?? ""] ?? undefined,
    }));

    return {
      success: true,
      message: "Leads retrieved.",
      data: enriched,
      total: count ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Leads fetch error", { workspaceId, reason: message });
    return { success: false, message: "Failed to fetch leads.", error: message };
  }
}

/**
 * Get a single lead by ID with relations.
 */
export async function getLead(
  id: string,
): Promise<GetOneResponse<LeadWithRelations>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !lead) {
    return { success: false, message: "Lead not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(lead.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch related entities
  const [companyResult, contactResult, assigneeResult] = await Promise.all([
    lead.company_id
      ? supabase.from("companies").select("*").eq("id", lead.company_id).single()
      : Promise.resolve({ data: null }),
    lead.contact_id
      ? supabase.from("contacts").select("*").eq("id", lead.contact_id).single()
      : Promise.resolve({ data: null }),
    lead.assigned_to
      ? supabase.from("profiles").select("id, full_name, avatar_url").eq("id", lead.assigned_to).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    success: true,
    message: "Lead retrieved.",
    record: {
      ...lead,
      company: companyResult.data ?? undefined,
      contact: contactResult.data ?? undefined,
      assignee: assigneeResult.data
        ? { full_name: assigneeResult.data.full_name, avatar_url: assigneeResult.data.avatar_url }
        : undefined,
    },
  };
}

/**
 * Update the status of a lead (e.g. move to 'contacted', 'qualified', 'won', 'lost').
 */
export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
  lostReason?: string,
): Promise<CrmActionResponse & { lead?: Lead }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id, workspace_id, title, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Lead not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const updateData: Record<string, unknown> = { status };
    if (status === "lost" && lostReason) {
      updateData.lost_reason = lostReason;
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !lead) {
      logger.error("Failed to update lead status", { leadId: id, reason: error?.message });
      return { success: false, message: "Failed to update lead status.", error: "UPDATE_FAILED" };
    }

    logger.info("Lead status updated", { leadId: id, oldStatus: existing.status, newStatus: status });
    await logActivity(
      "lead_status_changed" as ActivityAction,
      `Lead "${existing.title}" status changed from ${existing.status} to ${status}`,
      { oldStatus: existing.status, newStatus: status },
      existing.workspace_id,
    );
    void createNotification(profile.id, "crm", "Lead status updated", `Lead "${existing.title}" status changed to ${status}`, "/business");
    revalidatePath("/business");
    return { success: true, message: "Lead status updated.", lead };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Lead status update error", { leadId: id, reason: message });
    return { success: false, message: "Failed to update lead status.", error: message };
  }
}

/**
 * Convert a lead to a customer. Creates a Customer record from lead data,
 * updates the lead status to 'won', and creates an opportunity if value > 0.
 */
export async function convertLeadToCustomer(
  leadId: string,
): Promise<CrmActionResponse & { customer?: Customer; opportunity?: Opportunity }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) {
    return { success: false, message: "Lead not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(lead.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (lead.status === "won") {
    return { success: false, message: "Lead has already been converted.", error: "ALREADY_CONVERTED" };
  }

  try {
    // 1. Create the customer from lead data
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        workspace_id: lead.workspace_id,
        name: lead.title,
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        country: "",
        postal_code: "",
        notes: lead.notes,
        company_id: lead.company_id,
        contact_id: lead.contact_id,
        tags: lead.tags,
        customer_since: new Date().toISOString(),
        total_revenue: 0,
        total_invoices: 0,
        created_by: profile.id,
      })
      .select()
      .single();

    if (customerError || !customer) {
      logger.error("Failed to create customer from lead", { leadId, reason: customerError?.message });
      return { success: false, message: "Failed to create customer from lead.", error: "CREATE_FAILED" };
    }

    // 2. Update lead status to 'won'
    await supabase
      .from("leads")
      .update({ status: "won" as LeadStatus })
      .eq("id", leadId);

    // 3. Create opportunity if value > 0
    let opportunity: Opportunity | undefined;
    if (lead.value > 0) {
      const { data: opp, error: oppError } = await supabase
        .from("opportunities")
        .insert({
          workspace_id: lead.workspace_id,
          title: `Opp: ${lead.title}`,
          value: lead.value,
          stage: "qualification" as OpportunityStage,
          probability: 50,
          description: lead.description,
          assigned_to: lead.assigned_to,
          lost_reason: "",
          tags: lead.tags,
          company_id: lead.company_id,
          contact_id: lead.contact_id,
          lead_id: lead.id,
          expected_close_date: lead.expected_close_date,
          created_by: profile.id,
        })
        .select()
        .single();

      if (!oppError && opp) {
        opportunity = opp;
      }
    }

    logger.info("Lead converted to customer", {
      leadId,
      customerId: customer.id,
      opportunityId: opportunity?.id ?? null,
    });
    await logActivity(
      "lead_converted" as ActivityAction,
      `Converted lead "${lead.title}" to customer`,
      { customerId: customer.id, opportunityId: opportunity?.id ?? null },
      lead.workspace_id,
    );
    revalidatePath("/business");
    return { success: true, message: "Lead converted to customer.", customer, opportunity };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Lead conversion error", { leadId, reason: message });
    return { success: false, message: "Failed to convert lead to customer.", error: message };
  }
}

// ── Opportunities ─────────────────────────────────────────────────────────

/**
 * Create a new opportunity.
 */
export async function createOpportunity(
  workspaceId: string,
  data: {
    title: string;
    value: number;
    stage: OpportunityStage;
    probability?: number;
    description?: string;
    assigned_to?: string | null;
    tags?: string[];
    company_id?: string | null;
    contact_id?: string | null;
    lead_id?: string | null;
    expected_close_date?: string | null;
  },
): Promise<CrmActionResponse & { opportunity?: Opportunity }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedTitle = (data.title ?? "").trim();
  if (!trimmedTitle) {
    return { success: false, message: "Opportunity title is required.", error: "VALIDATION_ERROR" };
  }

  try {
    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .insert({
        workspace_id: workspaceId,
        title: trimmedTitle,
        value: data.value,
        stage: data.stage,
        probability: data.probability ?? 50,
        description: data.description ?? "",
        assigned_to: data.assigned_to ?? null,
        lost_reason: "",
        tags: data.tags ?? [],
        company_id: data.company_id ?? null,
        contact_id: data.contact_id ?? null,
        lead_id: data.lead_id ?? null,
        expected_close_date: data.expected_close_date ?? null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !opportunity) {
      logger.error("Failed to create opportunity", { workspaceId, reason: error?.message });
      return { success: false, message: "Failed to create opportunity.", error: "CREATE_FAILED" };
    }

    logger.info("Opportunity created", { opportunityId: opportunity.id, workspaceId });
    await logActivity("opportunity_created" as ActivityAction, `Created opportunity: ${trimmedTitle}`, {}, workspaceId);
    void createNotification(profile.id, "crm", "New opportunity created", `Opportunity: ${trimmedTitle}`, "/business");
    revalidatePath("/business");
    return { success: true, message: "Opportunity created.", opportunity };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Opportunity creation error", { workspaceId, reason: message });
    return { success: false, message: "Failed to create opportunity.", error: message };
  }
}

/**
 * Update an existing opportunity.
 */
export async function updateOpportunity(
  id: string,
  data: Partial<Pick<Opportunity, "title" | "value" | "stage" | "probability" | "description" | "assigned_to" | "tags" | "company_id" | "contact_id" | "lead_id" | "expected_close_date" | "lost_reason">>,
): Promise<CrmActionResponse & { opportunity?: Opportunity }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Opportunity not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !opportunity) {
      logger.error("Failed to update opportunity", { opportunityId: id, reason: error?.message });
      return { success: false, message: "Failed to update opportunity.", error: "UPDATE_FAILED" };
    }

    logger.info("Opportunity updated", { opportunityId: id });
    await logActivity("opportunity_updated" as ActivityAction, `Updated opportunity: ${existing.title}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Opportunity updated.", opportunity };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Opportunity update error", { opportunityId: id, reason: message });
    return { success: false, message: "Failed to update opportunity.", error: message };
  }
}

/**
 * Delete an opportunity.
 */
export async function deleteOpportunity(
  id: string,
): Promise<CrmActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Opportunity not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "admin"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { error } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Failed to delete opportunity", { opportunityId: id, reason: error.message });
      return { success: false, message: "Failed to delete opportunity.", error: "DELETE_FAILED" };
    }

    logger.info("Opportunity deleted", { opportunityId: id });
    await logActivity("opportunity_deleted" as ActivityAction, `Deleted opportunity: ${existing.title}`, {}, existing.workspace_id);
    revalidatePath("/business");
    return { success: true, message: "Opportunity deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Opportunity delete error", { opportunityId: id, reason: message });
    return { success: false, message: "Failed to delete opportunity.", error: message };
  }
}

/**
 * Get a paginated list of opportunities for a workspace.
 */
export async function getOpportunities(
  options: OpportunityListOptions,
): Promise<PaginatedResponse<OpportunityWithRelations>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(options.workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { workspaceId, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, stage, assignedTo } = options;
  const effectivePageSize = Math.min(pageSize, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * effectivePageSize;

  try {
    let query = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId);

    if (stage) {
      query = query.eq("stage", stage);
    }
    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    query = query.order("created_at", { ascending: false });
    query = query.range(offset, offset + effectivePageSize - 1);

    const { data: opportunities, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch opportunities", { workspaceId, reason: error.message });
      return { success: false, message: "Failed to fetch opportunities.", error: "FETCH_FAILED" };
    }

    // Batch-fetch related entities
    const oppList = opportunities ?? [];
    const companyIds = [...new Set(oppList.map((o) => o.company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(oppList.map((o) => o.contact_id).filter(Boolean))] as string[];
    const assigneeIds = [...new Set(oppList.map((o) => o.assigned_to).filter(Boolean))] as string[];

    const [companiesResult, contactsResult, assigneesResult] = await Promise.all([
      companyIds.length > 0
        ? supabase.from("companies").select("id, name, industry, website").in("id", companyIds)
        : Promise.resolve({ data: [] }),
      contactIds.length > 0
        ? supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
        : Promise.resolve({ data: [] }),
      assigneeIds.length > 0
        ? supabase.from("profiles").select("id, full_name").in("id", assigneeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const companyMap = new Map((companiesResult.data ?? []).map((c) => [c.id, c]));
    const contactMap = new Map((contactsResult.data ?? []).map((c) => [c.id, c]));
    const assigneeMap = new Map((assigneesResult.data ?? []).map((a) => [a.id, a]));

    const enriched: OpportunityWithRelations[] = oppList.map((opp) => ({
      ...opp,
      company: companyMap.get(opp.company_id ?? "") ?? undefined,
      contact: contactMap.get(opp.contact_id ?? "") ?? undefined,
      assignee: assigneeMap.get(opp.assigned_to ?? "") ?? undefined,
    }));

    return {
      success: true,
      message: "Opportunities retrieved.",
      data: enriched,
      total: count ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Opportunities fetch error", { workspaceId, reason: message });
    return { success: false, message: "Failed to fetch opportunities.", error: message };
  }
}

/**
 * Get a single opportunity by ID with relations.
 */
export async function getOpportunity(
  id: string,
): Promise<GetOneResponse<OpportunityWithRelations>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !opportunity) {
    return { success: false, message: "Opportunity not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(opportunity.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch related entities
  const [companyResult, contactResult, assigneeResult] = await Promise.all([
    opportunity.company_id
      ? supabase.from("companies").select("*").eq("id", opportunity.company_id).single()
      : Promise.resolve({ data: null }),
    opportunity.contact_id
      ? supabase.from("contacts").select("*").eq("id", opportunity.contact_id).single()
      : Promise.resolve({ data: null }),
    opportunity.assigned_to
      ? supabase.from("profiles").select("id, full_name").eq("id", opportunity.assigned_to).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    success: true,
    message: "Opportunity retrieved.",
    record: {
      ...opportunity,
      company: companyResult.data ?? undefined,
      contact: contactResult.data ?? undefined,
      assignee: assigneeResult.data
        ? { full_name: assigneeResult.data.full_name }
        : undefined,
    },
  };
}

/**
 * Update the stage of an opportunity (move through the pipeline).
 */
export async function updateOpportunityStage(
  id: string,
  stage: OpportunityStage,
): Promise<CrmActionResponse & { opportunity?: Opportunity }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, workspace_id, title, stage")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Opportunity not found.", error: "NOT_FOUND" };
  }

  try { await requireMinimumRole(existing.workspace_id, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .update({ stage })
      .eq("id", id)
      .select()
      .single();

    if (error || !opportunity) {
      logger.error("Failed to update opportunity stage", { opportunityId: id, reason: error?.message });
      return { success: false, message: "Failed to update opportunity stage.", error: "UPDATE_FAILED" };
    }

    logger.info("Opportunity stage updated", {
      opportunityId: id,
      oldStage: existing.stage,
      newStage: stage,
    });
    await logActivity(
      "opportunity_stage_changed" as ActivityAction,
      `Opportunity "${existing.title}" stage changed from ${existing.stage} to ${stage}`,
      { oldStage: existing.stage, newStage: stage },
      existing.workspace_id,
    );
    revalidatePath("/business");
    return { success: true, message: "Opportunity stage updated.", opportunity };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Opportunity stage update error", { opportunityId: id, reason: message });
    return { success: false, message: "Failed to update opportunity stage.", error: message };
  }
}

/**
 * Get pipeline summary — count and total value per stage for a workspace.
 */
export async function getPipelineSummary(
  workspaceId: string,
): Promise<CrmActionResponse & { summary?: PipelineSummary[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  try {
    const { data: opportunities, error } = await supabase
      .from("opportunities")
      .select("stage, value")
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to fetch pipeline summary", { workspaceId, reason: error.message });
      return { success: false, message: "Failed to fetch pipeline summary.", error: "FETCH_FAILED" };
    }

    // Aggregate by stage
    const stageMap = new Map<string, { count: number; value: number }>();
    for (const opp of opportunities ?? []) {
      const existing = stageMap.get(opp.stage) ?? { count: 0, value: 0 };
      existing.count += 1;
      existing.value += opp.value;
      stageMap.set(opp.stage, existing);
    }

    const allStages: OpportunityStage[] = [
      "lead",
      "qualification",
      "proposal",
      "negotiation",
      "closed_won",
      "closed_lost",
    ];

    const summary: PipelineSummary[] = allStages.map((stage) => ({
      stage,
      count: stageMap.get(stage)?.count ?? 0,
      value: stageMap.get(stage)?.value ?? 0,
    }));

    return {
      success: true,
      message: "Pipeline summary retrieved.",
      summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Pipeline summary error", { workspaceId, reason: message });
    return { success: false, message: "Failed to fetch pipeline summary.", error: message };
  }
}

// ── AI Lead Scoring ──────────────────────────────────────────────────────

/**
 * Use AI to score a lead on a 0-100 scale with reasoning and suggestions.
 * If AI fails, returns score 0.
 */
export async function aiScoreLead(
  leadId: string,
  workspaceId: string,
): Promise<CrmActionResponse & { result?: AiLeadScoringResult }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();
  void profile; // Auth verified

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch lead with relations
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !lead) {
    return { success: false, message: "Lead not found.", error: "NOT_FOUND" };
  }

  // Fetch related company and contact for context
  const [companyResult, contactResult] = await Promise.all([
    lead.company_id
      ? supabase.from("companies").select("name, industry, website, city, country").eq("id", lead.company_id).single()
      : Promise.resolve({ data: null }),
    lead.contact_id
      ? supabase.from("contacts").select("first_name, last_name, email, job_title").eq("id", lead.contact_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const company = companyResult.data;
  const contact = contactResult.data;

  // Build context for AI
  const leadContext = `
Lead Title: ${lead.title}
Source: ${lead.source}
Status: ${lead.status}
Estimated Value: $${lead.value}
Description: ${lead.description}
Notes: ${lead.notes}
Created: ${lead.created_at}
Expected Close: ${lead.expected_close_date ?? "Not set"}
${company ? `Company: ${company.name} (Industry: ${company.industry || "N/A"}, Location: ${company.city || "N/A"}, ${company.country || "N/A"})` : "No company linked"}
${contact ? `Contact: ${contact.first_name} ${contact.last_name} (${contact.email}, Job: ${contact.job_title || "N/A"})` : "No contact linked"}
`.trim();

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("AI lead scoring failed — no API key configured", { leadId });
    return {
      success: false,
      message: "AI provider is not configured.",
      error: "AI_NOT_CONFIGURED",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a CRM lead scoring expert. Analyze the provided lead information and return a JSON object with exactly these fields: { \"score\": <number 0-100>, \"reasoning\": \"<brief explanation of the score>\", \"suggestions\": [\"<actionable suggestion 1>\", \"<actionable suggestion 2>\", \"<actionable suggestion 3>\"] }. Be concise and practical. Score based on: lead source quality, company information, engagement signals, estimated value, and completeness of data.",
          },
          { role: "user", content: leadContext },
        ],
        max_tokens: 1024,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("AI lead scoring API error", { leadId, status: response.status, body: errorBody });
      // Update lead score to 0 and return
      await supabase.from("leads").update({ score: 0 }).eq("id", leadId);
      return {
        success: false,
        message: "AI scoring request failed.",
        error: "AI_REQUEST_FAILED",
        result: { leadId, score: 0, reasoning: "AI scoring failed.", suggestions: [] },
      };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";

    // Parse the JSON response
    const parsed = JSON.parse(content) as {
      score?: number;
      reasoning?: string;
      suggestions?: string[];
    };

    const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "AI scoring completed.";
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    // Update the lead score in the database
    await supabase.from("leads").update({ score }).eq("id", leadId);

    const result: AiLeadScoringResult = { leadId, score, reasoning, suggestions };

    logger.info("AI lead scoring completed", { leadId, score });
    await logActivity(
      "lead_scored" as ActivityAction,
      `AI scored lead "${lead.title}" with score ${score}`,
      { leadId, score, reasoning },
      workspaceId,
    );

    return { success: true, message: "Lead scored successfully.", result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("AI lead scoring error", { leadId, reason: message });

    // Update lead score to 0 on error
    await supabase.from("leads").update({ score: 0 }).eq("id", leadId);

    return {
      success: false,
      message: "AI scoring failed.",
      error: message,
      result: { leadId, score: 0, reasoning: "AI scoring failed.", suggestions: [] },
    };
  }
}
