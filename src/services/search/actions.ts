"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logActivity } from "@/services/activity-log/actions";
import type { Json } from "@/types/generated/database";
import type {
  SearchResultItem,
  SearchFilters,
} from "./types";

// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Global search across documents, folders, files, knowledge base, and members.
 * Returns a unified SearchResultItem[].
 */
export async function globalSearch(
  filters: SearchFilters,
): Promise<{ success: boolean; message: string; error?: string; results?: SearchResultItem[] }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const query = filters.query?.trim();
  if (!query) {
    return { success: true, message: "Empty query.", results: [] };
  }

  const types = filters.types ?? ["document", "folder", "file", "knowledge", "member", "company", "contact", "lead", "invoice", "project", "contract", "quotation", "expense", "receipt", "product", "employee", "task", "calendar_event", "supplier"];
  const results: SearchResultItem[] = [];

  // Search documents
  if (types.includes("document")) {
    let docQuery = supabase
      .from("documents")
      .select("id, workspace_id, title, content, created_at")
      .neq("status", "deleted")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) docQuery = docQuery.eq("workspace_id", filters.workspace_id);

    const { data: docs } = await docQuery;

    for (const doc of docs ?? []) {
      results.push({
        id: doc.id,
        type: "document",
        title: doc.title,
        description: doc.content.slice(0, 200),
        workspace_id: doc.workspace_id,
        created_at: doc.created_at,
        metadata: {},
      });
    }
  }

  // Search folders
  if (types.includes("folder")) {
    let folderQuery = supabase
      .from("folders")
      .select("id, workspace_id, name, description, created_at")
      .ilike("name", `%${query}%`)
      .limit(20);

    if (filters.workspace_id) folderQuery = folderQuery.eq("workspace_id", filters.workspace_id);

    const { data: folders } = await folderQuery;

    for (const folder of folders ?? []) {
      results.push({
        id: folder.id,
        type: "folder",
        title: folder.name,
        description: folder.description ?? "",
        workspace_id: folder.workspace_id,
        created_at: folder.created_at,
        metadata: {},
      });
    }
  }

  // Search file_library
  if (types.includes("file")) {
    let fileQuery = supabase
      .from("file_library")
      .select("id, workspace_id, file_name, mime_type, size_bytes, created_at")
      .ilike("file_name", `%${query}%`)
      .limit(20);

    if (filters.workspace_id) fileQuery = fileQuery.eq("workspace_id", filters.workspace_id);

    const { data: files } = await fileQuery;

    for (const file of files ?? []) {
      results.push({
        id: file.id,
        type: "file",
        title: file.file_name,
        description: `${file.mime_type} — ${formatBytes(file.size_bytes)}`,
        workspace_id: file.workspace_id,
        created_at: file.created_at,
        metadata: { mime_type: file.mime_type, size_bytes: file.size_bytes } as Json,
      });
    }
  }

  // Search knowledge_base
  if (types.includes("knowledge")) {
    let kbQuery = supabase
      .from("knowledge_base")
      .select("id, workspace_id, title, content, category, created_at")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) kbQuery = kbQuery.eq("workspace_id", filters.workspace_id);

    const { data: entries } = await kbQuery;

    for (const entry of entries ?? []) {
      results.push({
        id: entry.id,
        type: "knowledge",
        title: entry.title,
        description: entry.content.slice(0, 200),
        workspace_id: entry.workspace_id,
        created_at: entry.created_at,
        metadata: { category: entry.category } as Json,
      });
    }
  }

  // Search members (by name)
  if (types.includes("member")) {
    let memberQuery = supabase
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, profiles!inner(full_name, avatar_url)")
      .ilike("profiles.full_name", `%${query}%`)
      .limit(20);

    if (filters.workspace_id) memberQuery = memberQuery.eq("workspace_id", filters.workspace_id);

    const { data: members } = await memberQuery;

    for (const member of members ?? []) {
      const raw = member.profiles as unknown;
      const p = (raw ?? { full_name: null, avatar_url: null }) as { full_name: string | null; avatar_url: string | null };
      results.push({
        id: member.user_id,
        type: "member",
        title: String(p.full_name ?? "Unknown"),
        description: `Role: ${member.role}`,
        workspace_id: member.workspace_id,
        created_at: "",
        metadata: { role: member.role, avatar_url: p?.avatar_url } as Json,
      });
    }
  }

  // Search companies
  if (types.includes("company")) {
    let companyQuery = supabase
      .from("companies")
      .select("id, workspace_id, name, industry, email, phone, created_at")
      .or(`name.ilike.%${query}%,industry.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) companyQuery = companyQuery.eq("workspace_id", filters.workspace_id);

    const { data: companies } = await companyQuery;

    for (const company of companies ?? []) {
      results.push({
        id: company.id,
        type: "company",
        title: company.name,
        description: [company.industry, company.email, company.phone].filter(Boolean).join(" — "),
        workspace_id: company.workspace_id,
        created_at: company.created_at,
        metadata: {},
      });
    }
  }

  // Search contacts
  if (types.includes("contact")) {
    let contactQuery = supabase
      .from("contacts")
      .select("id, workspace_id, first_name, last_name, email, phone, created_at")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) contactQuery = contactQuery.eq("workspace_id", filters.workspace_id);

    const { data: contacts } = await contactQuery;

    for (const contact of contacts ?? []) {
      results.push({
        id: contact.id,
        type: "contact",
        title: `${contact.first_name} ${contact.last_name}`,
        description: [contact.email, contact.phone].filter(Boolean).join(" — "),
        workspace_id: contact.workspace_id,
        created_at: contact.created_at,
        metadata: {},
      });
    }
  }

  // Search leads
  if (types.includes("lead")) {
    let leadQuery = supabase
      .from("leads")
      .select("id, workspace_id, first_name, last_name, email, company, created_at")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) leadQuery = leadQuery.eq("workspace_id", filters.workspace_id);

    const { data: leads } = await leadQuery;

    for (const lead of leads ?? []) {
      results.push({
        id: lead.id,
        type: "lead",
        title: `${lead.first_name} ${lead.last_name}`,
        description: [lead.email, lead.company].filter(Boolean).join(" — "),
        workspace_id: lead.workspace_id,
        created_at: lead.created_at,
        metadata: {},
      });
    }
  }

  // Search invoices
  if (types.includes("invoice")) {
    let invoiceQuery = supabase
      .from("invoices")
      .select("id, workspace_id, invoice_number, status, created_at")
      .or(`invoice_number.ilike.%${query}%,status.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) invoiceQuery = invoiceQuery.eq("workspace_id", filters.workspace_id);

    const { data: invoices } = await invoiceQuery;

    for (const invoice of invoices ?? []) {
      results.push({
        id: invoice.id,
        type: "invoice",
        title: invoice.invoice_number,
        description: `Status: ${invoice.status}`,
        workspace_id: invoice.workspace_id,
        created_at: invoice.created_at,
        metadata: {},
      });
    }
  }

  // Search projects
  if (types.includes("project")) {
    let projectQuery = supabase
      .from("projects")
      .select("id, workspace_id, name, description, created_at")
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) projectQuery = projectQuery.eq("workspace_id", filters.workspace_id);

    const { data: projects } = await projectQuery;

    for (const project of projects ?? []) {
      results.push({
        id: project.id,
        type: "project",
        title: project.name,
        description: project.description ?? "",
        workspace_id: project.workspace_id,
        created_at: project.created_at,
        metadata: {},
      });
    }
  }

  // Search contracts
  if (types.includes("contract")) {
    let contractQuery = supabase
      .from("contracts")
      .select("id, workspace_id, title, status, created_at")
      .or(`title.ilike.%${query}%,status.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) contractQuery = contractQuery.eq("workspace_id", filters.workspace_id);

    const { data: contracts } = await contractQuery;

    for (const contract of contracts ?? []) {
      results.push({
        id: contract.id,
        type: "contract",
        title: contract.title,
        description: `Status: ${contract.status}`,
        workspace_id: contract.workspace_id,
        created_at: contract.created_at,
        metadata: {},
      });
    }
  }

  // Search quotations
  if (types.includes("quotation")) {
    let quotationQuery = supabase
      .from("quotations")
      .select("id, workspace_id, quotation_number, status, created_at")
      .or(`quotation_number.ilike.%${query}%,status.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) quotationQuery = quotationQuery.eq("workspace_id", filters.workspace_id);

    const { data: quotations } = await quotationQuery;

    for (const q of quotations ?? []) {
      results.push({
        id: q.id,
        type: "quotation",
        title: q.quotation_number,
        description: `Status: ${q.status}`,
        workspace_id: q.workspace_id,
        created_at: q.created_at,
        metadata: {},
      });
    }
  }

  // Search expenses
  if (types.includes("expense")) {
    let expenseQuery = supabase
      .from("expenses")
      .select("id, workspace_id, description, category, vendor, created_at")
      .or(`description.ilike.%${query}%,category.ilike.%${query}%,vendor.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) expenseQuery = expenseQuery.eq("workspace_id", filters.workspace_id);

    const { data: expenses } = await expenseQuery;

    for (const e of expenses ?? []) {
      results.push({
        id: e.id,
        type: "expense",
        title: e.description,
        description: [e.category, e.vendor].filter(Boolean).join(" — "),
        workspace_id: e.workspace_id,
        created_at: e.created_at,
        metadata: {},
      });
    }
  }

  // Search receipts
  if (types.includes("receipt")) {
    let receiptQuery = supabase
      .from("receipts")
      .select("id, workspace_id, description, vendor, payment_method, created_at")
      .or(`description.ilike.%${query}%,vendor.ilike.%${query}%,payment_method.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) receiptQuery = receiptQuery.eq("workspace_id", filters.workspace_id);

    const { data: receipts } = await receiptQuery;

    for (const r of receipts ?? []) {
      results.push({
        id: r.id,
        type: "receipt",
        title: r.description,
        description: [r.vendor, r.payment_method].filter(Boolean).join(" — "),
        workspace_id: r.workspace_id,
        created_at: r.created_at,
        metadata: {},
      });
    }
  }

  // Search products
  if (types.includes("product")) {
    let productQuery = supabase
      .from("products")
      .select("id, workspace_id, name, sku, category, created_at")
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%,category.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) productQuery = productQuery.eq("workspace_id", filters.workspace_id);

    const { data: products } = await productQuery;

    for (const p of products ?? []) {
      results.push({
        id: p.id,
        type: "product",
        title: p.name,
        description: [p.sku, p.category].filter(Boolean).join(" — "),
        workspace_id: p.workspace_id,
        created_at: p.created_at,
        metadata: {},
      });
    }
  }

  // Search ai_employees
  if (types.includes("employee")) {
    let employeeQuery = supabase
      .from("ai_employees")
      .select("id, workspace_id, name, role, department, created_at")
      .or(`name.ilike.%${query}%,role.ilike.%${query}%,department.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) employeeQuery = employeeQuery.eq("workspace_id", filters.workspace_id);

    const { data: employees } = await employeeQuery;

    for (const e of employees ?? []) {
      results.push({
        id: e.id,
        type: "employee",
        title: e.name,
        description: [e.role, e.department].filter(Boolean).join(" — "),
        workspace_id: e.workspace_id,
        created_at: e.created_at,
        metadata: {},
      });
    }
  }

  // Search tasks
  if (types.includes("task")) {
    let taskQuery = supabase
      .from("tasks")
      .select("id, workspace_id, title, description, status, created_at")
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,status.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) taskQuery = taskQuery.eq("workspace_id", filters.workspace_id);

    const { data: tasks } = await taskQuery;

    for (const t of tasks ?? []) {
      results.push({
        id: t.id,
        type: "task",
        title: t.title,
        description: [t.status, t.description].filter(Boolean).join(" — "),
        workspace_id: t.workspace_id,
        created_at: t.created_at,
        metadata: {},
      });
    }
  }

  // Search calendar_events
  if (types.includes("calendar_event")) {
    let eventQuery = supabase
      .from("calendar_events")
      .select("id, workspace_id, title, description, location, created_at")
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,location.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) eventQuery = eventQuery.eq("workspace_id", filters.workspace_id);

    const { data: events } = await eventQuery;

    for (const ev of events ?? []) {
      results.push({
        id: ev.id,
        type: "calendar_event",
        title: ev.title,
        description: [ev.location, ev.description].filter(Boolean).join(" — "),
        workspace_id: ev.workspace_id,
        created_at: ev.created_at,
        metadata: {},
      });
    }
  }

  // Search suppliers
  if (types.includes("supplier")) {
    let supplierQuery = supabase
      .from("suppliers")
      .select("id, workspace_id, name, contact_name, email, created_at")
      .or(`name.ilike.%${query}%,contact_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(20);

    if (filters.workspace_id) supplierQuery = supplierQuery.eq("workspace_id", filters.workspace_id);

    const { data: suppliers } = await supplierQuery;

    for (const s of suppliers ?? []) {
      results.push({
        id: s.id,
        type: "supplier",
        title: s.name,
        description: [s.contact_name, s.email].filter(Boolean).join(" — "),
        workspace_id: s.workspace_id,
        created_at: s.created_at,
        metadata: {},
      });
    }
  }

  await logActivity("search_executed", `Global search: ${query}`, { types, result_count: results.length });
  return { success: true, message: "Search completed.", results };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
