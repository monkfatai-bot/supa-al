"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — data hooks.
 *
 * TanStack Query wrappers for every `/api/business/*` REST endpoint the
 * Business dashboard consumes. Each hook returns the standard TanStack
 * Query result; mutations invalidate the relevant query keys so the
 * UI stays in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * The hooks are deliberately thin — they own no UI state. The
 * cross-component UI state (active tab, search box, status filter)
 * lives in the view components themselves.
 *
 * @module @/hooks/use-business
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  BusinessAiAnswer,
  BusinessDashboardStats,
  CalendarEvent,
  CreateCustomerInput,
  CreateInvoiceInput,
  CreateProjectInput,
  Customer,
  CustomerStatus,
  ExpenseReport,
  Invoice,
  InvoiceStatus,
  PipelineReport,
  Project,
  ProjectStatus,
  RevenueReport,
} from "@/lib/business/client";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const businessKeys = {
  all: ["business"] as const,
  customers: (workspaceId: string | null, opts?: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "business",
      "customers",
      workspaceId ?? null,
      opts?.search ?? "",
      opts?.status ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  invoices: (workspaceId: string | null, opts?: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "business",
      "invoices",
      workspaceId ?? null,
      opts?.search ?? "",
      opts?.status ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  projects: (workspaceId: string | null, opts?: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "business",
      "projects",
      workspaceId ?? null,
      opts?.search ?? "",
      opts?.status ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  calendar: (workspaceId: string | null, opts?: {
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) =>
    [
      "business",
      "calendar",
      workspaceId ?? null,
      opts?.type ?? "",
      opts?.dateFrom ?? "",
      opts?.dateTo ?? "",
      opts?.limit ?? 50,
    ] as const,
  dashboard: (workspaceId: string | null) =>
    ["business", "dashboard", workspaceId ?? null] as const,
  report: (
    workspaceId: string | null,
    type: "revenue" | "expenses" | "pipeline",
  ) => ["business", "reports", workspaceId ?? null, type] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface BusinessApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<BusinessApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return {
      message: `Request failed (${res.status}).`,
      status: res.status,
    };
  }
  const envelope = raw as ApiResponse<never>;
  if (envelope && envelope.success === false && envelope.error) {
    return {
      message: envelope.error.message,
      code: envelope.error.code,
      status: res.status,
    };
  }
  return { message: `Request failed (${res.status}).`, status: res.status };
}

/**
 * Issue a JSON request and either return the typed `data` payload or
 * throw a normalized {@link BusinessApiError}.
 */
async function apiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    throw await unwrapError(res);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as BusinessApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/** List query options accepted by {@link useCustomers}. */
export interface ListCustomersQuery {
  search?: string;
  status?: CustomerStatus | "";
  limit?: number;
  offset?: number;
}

/** GET `/api/business/customers` — list customers in a workspace. */
export function useCustomers(
  workspaceId: string | null,
  opts: ListCustomersQuery = {},
) {
  return useQuery({
    queryKey: businessKeys.customers(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (workspaceId) p.set("workspaceId", workspaceId);
      if (opts.search) p.set("search", opts.search);
      if (opts.status) p.set("status", opts.status);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      return apiRequest<{ customers: Customer[] }>(
        "GET",
        `/api/business/customers?${p.toString()}`,
      ).then((r) => r.customers);
    },
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** POST `/api/business/customers` — create a new customer. */
export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateCustomerInput;
    }) =>
      apiRequest<{ customer: Customer }>(
        "POST",
        "/api/business/customers",
        { workspaceId, ...input },
      ).then((r) => r.customer),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["business", "customers", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: ["business", "dashboard", vars.workspaceId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/** List query options accepted by {@link useInvoices}. */
export interface ListInvoicesQuery {
  search?: string;
  status?: InvoiceStatus | "";
  limit?: number;
  offset?: number;
}

/** GET `/api/business/invoices` — list invoices in a workspace. */
export function useInvoices(
  workspaceId: string | null,
  opts: ListInvoicesQuery = {},
) {
  return useQuery({
    queryKey: businessKeys.invoices(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (workspaceId) p.set("workspaceId", workspaceId);
      if (opts.search) p.set("search", opts.search);
      if (opts.status) p.set("status", opts.status);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      return apiRequest<{ invoices: Invoice[] }>(
        "GET",
        `/api/business/invoices?${p.toString()}`,
      ).then((r) => r.invoices);
    },
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** POST `/api/business/invoices` — create a new invoice. */
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateInvoiceInput;
    }) =>
      apiRequest<{ invoice: Invoice }>(
        "POST",
        "/api/business/invoices",
        { workspaceId, ...input },
      ).then((r) => r.invoice),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["business", "invoices", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: ["business", "dashboard", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: ["business", "reports", vars.workspaceId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** List query options accepted by {@link useProjects}. */
export interface ListProjectsQuery {
  search?: string;
  status?: ProjectStatus | "";
  limit?: number;
  offset?: number;
}

/** GET `/api/business/projects` — list projects in a workspace. */
export function useProjects(
  workspaceId: string | null,
  opts: ListProjectsQuery = {},
) {
  return useQuery({
    queryKey: businessKeys.projects(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (workspaceId) p.set("workspaceId", workspaceId);
      if (opts.search) p.set("search", opts.search);
      if (opts.status) p.set("status", opts.status);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      return apiRequest<{ projects: Project[] }>(
        "GET",
        `/api/business/projects?${p.toString()}`,
      ).then((r) => r.projects);
    },
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** POST `/api/business/projects` — create a new project. */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateProjectInput;
    }) =>
      apiRequest<{ project: Project }>(
        "POST",
        "/api/business/projects",
        { workspaceId, ...input },
      ).then((r) => r.project),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["business", "projects", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: ["business", "dashboard", vars.workspaceId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

/** List query options accepted by {@link useCalendarEvents}. */
export interface ListCalendarEventsQuery {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

/** GET `/api/business/calendar` — list calendar events in a workspace. */
export function useCalendarEvents(
  workspaceId: string | null,
  opts: ListCalendarEventsQuery = {},
) {
  return useQuery({
    queryKey: businessKeys.calendar(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (workspaceId) p.set("workspaceId", workspaceId);
      if (opts.type) p.set("type", opts.type);
      if (opts.dateFrom) p.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) p.set("dateTo", opts.dateTo);
      if (opts.limit) p.set("limit", String(opts.limit));
      return apiRequest<{ events: CalendarEvent[] }>(
        "GET",
        `/api/business/calendar?${p.toString()}`,
      ).then((r) => r.events);
    },
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET `/api/business/dashboard` — aggregate stats for the dashboard. */
export function useDashboard(workspaceId: string | null) {
  return useQuery({
    queryKey: businessKeys.dashboard(workspaceId),
    queryFn: () =>
      apiRequest<{ stats: BusinessDashboardStats }>(
        "GET",
        `/api/business/dashboard?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.stats),
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportType = "revenue" | "expenses" | "pipeline";

/** GET `/api/business/reports?type=…` — pull a typed report. */
export function useReports(
  workspaceId: string | null,
  type: ReportType,
) {
  return useQuery({
    queryKey: businessKeys.report(workspaceId, type),
    queryFn: () => {
      const p = new URLSearchParams();
      if (workspaceId) p.set("workspaceId", workspaceId);
      p.set("type", type);
      return apiRequest<{
        revenue?: RevenueReport;
        expenses?: ExpenseReport;
        pipeline?: PipelineReport;
      }>("GET", `/api/business/reports?${p.toString()}`);
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// AI assistant
// ---------------------------------------------------------------------------

/** POST `/api/business/ai-assistant` — ask a business question to the AI. */
export function useBusinessAI() {
  return useMutation({
    mutationFn: ({
      workspaceId,
      question,
    }: {
      workspaceId: string;
      question: string;
    }) =>
      apiRequest<{ answer: BusinessAiAnswer }>(
        "POST",
        "/api/business/ai-assistant",
        { workspace_id: workspaceId, question },
      ).then((r) => r.answer),
  });
}
