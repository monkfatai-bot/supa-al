"use client";

/**
 * Supa AI — Phase 9C employee data hooks.
 *
 * TanStack Query wrappers for every `/api/employees/*` REST endpoint
 * the employee UI consumes. Each hook returns the standard TanStack
 * Query result; mutations invalidate the relevant query keys so the
 * UI stays in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * The hooks are deliberately thin — they own no UI state. The
 * cross-component UI state (active tab, selected employee, active
 * chat employee) lives in {@link useEmployeeStore} (Zustand).
 *
 * @module @/hooks/use-employees
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  CreateEmployeeInput,
  CreateVersionInput,
  EmployeeChatResult,
  EmployeeDashboardSummary,
  EmployeeDepartment,
  EmployeeMarketplaceEntry,
  EmployeeMessage,
  EmployeePerformance,
  EmployeeSkill,
  EmployeeTraining,
  EmployeeVersion,
  EmployeeWithRelations,
  MemoryType,
  PublishToMarketplaceInput,
} from "@/lib/employees/client";
import type {
  AddMemoryInput,
  AddSkillInput,
  AssignToWorkspaceInput,
  ListEmployeesQuery,
  ListMarketplaceQuery,
  ListMemoryQuery,
  PerformanceQuery,
  SendMessageInput,
  TrainFromDocumentInput,
  TrainFromUrlInput,
  UpdateEmployeeInput,
  UpdateMemoryInput,
  UpdateSkillInput,
} from "@/lib/validation/employees";
import type { SkillDefinition, SkillCategory } from "@/lib/employees/client";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const employeeKeys = {
  all: ["employees"] as const,
  list: (opts?: ListEmployeesQuery) =>
    [
      "employees",
      "list",
      opts?.search ?? "",
      opts?.department ?? "",
      opts?.status ?? "",
      opts?.isTemplate ?? "",
      opts?.isPublic ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  detail: (id: string | null) =>
    ["employees", "detail", id ?? null] as const,
  skills: (employeeId: string | null) =>
    ["employees", "skills", employeeId ?? null] as const,
  memory: (employeeId: string | null, opts?: ListMemoryQuery) =>
    [
      "employees",
      "memory",
      employeeId ?? null,
      opts?.type ?? null,
      opts?.limit ?? 50,
    ] as const,
  training: (employeeId: string | null) =>
    ["employees", "training", employeeId ?? null] as const,
  assignments: (employeeId: string | null) =>
    ["employees", "assignments", employeeId ?? null] as const,
  performance: (employeeId: string | null, opts?: PerformanceQuery) =>
    [
      "employees",
      "performance",
      employeeId ?? null,
      opts?.dateFrom ?? null,
      opts?.dateTo ?? null,
    ] as const,
  versions: (employeeId: string | null) =>
    ["employees", "versions", employeeId ?? null] as const,
  dashboard: ["employees", "dashboard"] as const,
  departments: ["employees", "departments"] as const,
  catalog: ["employees", "catalog"] as const,
  marketplace: (opts?: ListMarketplaceQuery) =>
    [
      "employees",
      "marketplace",
      opts?.category ?? "",
      opts?.search ?? "",
      opts?.featured ?? "",
      opts?.limit ?? 24,
      opts?.offset ?? 0,
    ] as const,
  marketplaceEntry: (id: string | null) =>
    ["employees", "marketplace", "detail", id ?? null] as const,
  messages: (opts?: { fromId?: string; toId?: string; limit?: number }) =>
    [
      "employees",
      "messages",
      opts?.fromId ?? null,
      opts?.toId ?? null,
      opts?.limit ?? 50,
    ] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface EmployeeApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<EmployeeApiError> {
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
 * throw a normalized {@link EmployeeApiError}.
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
    } as EmployeeApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Employee CRUD
// ---------------------------------------------------------------------------

/** GET `/api/employees` — paginated list of the caller's employees. */
export function useEmployees(opts: ListEmployeesQuery = {}) {
  return useQuery({
    queryKey: employeeKeys.list(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.search) p.set("search", opts.search);
      if (opts.department) p.set("department", opts.department);
      if (opts.status) p.set("status", opts.status);
      if (opts.isTemplate !== undefined) p.set("isTemplate", String(opts.isTemplate));
      if (opts.isPublic !== undefined) p.set("isPublic", String(opts.isPublic));
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ employees: EmployeeWithRelations[] }>(
        "GET",
        `/api/employees${qs ? `?${qs}` : ""}`,
      ).then((r) => r.employees);
    },
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/employees/:id` — fetch a single employee + relations. */
export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: () =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "GET",
        `/api/employees/${id}`,
      ).then((r) => r.employee),
    enabled: !!id,
  });
}

/** POST `/api/employees` — create a new employee. */
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        "/api/employees",
        input,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

/** PATCH `/api/employees/:id` — partial update. */
export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateEmployeeInput;
    }) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "PATCH",
        `/api/employees/${id}`,
        input,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

/** DELETE `/api/employees/:id` — hard-delete. */
export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/employees/${id}`,
      ).then((r) => r.deleted),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: employeeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

/** POST `/api/employees/:id/clone`. */
export function useCloneEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        `/api/employees/${id}/clone`,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

/** POST `/api/employees/:id/pause`. */
export function usePauseEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        `/api/employees/${id}/pause`,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

/** POST `/api/employees/:id/resume`. */
export function useResumeEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        `/api/employees/${id}/resume`,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

/** POST `/api/employees/:id/archive`. */
export function useArchiveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        `/api/employees/${id}/archive`,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** GET `/api/employees/:id/skills`. */
export function useEmployeeSkills(employeeId: string | null) {
  return useQuery({
    queryKey: employeeKeys.skills(employeeId),
    queryFn: () =>
      apiRequest<{ skills: EmployeeSkill[] }>(
        "GET",
        `/api/employees/${employeeId}/skills`,
      ).then((r) => r.skills),
    enabled: !!employeeId,
  });
}

/** POST `/api/employees/:id/skills`. */
export function useAddSkill(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddSkillInput) =>
      apiRequest<{ skill: EmployeeSkill }>(
        "POST",
        `/api/employees/${employeeId}/skills`,
        input,
      ).then((r) => r.skill),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.skills(employeeId) });
      qc.invalidateQueries({ queryKey: employeeKeys.detail(employeeId) });
    },
  });
}

/** PATCH `/api/employees/:id/skills/:skillId`. */
export function useUpdateSkill(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      skillId,
      input,
    }: {
      skillId: string;
      input: UpdateSkillInput;
    }) =>
      apiRequest<{ skill: EmployeeSkill }>(
        "PATCH",
        `/api/employees/${employeeId}/skills/${skillId}`,
        input,
      ).then((r) => r.skill),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.skills(employeeId) });
      qc.invalidateQueries({ queryKey: employeeKeys.detail(employeeId) });
    },
  });
}

/** DELETE `/api/employees/:id/skills/:skillId`. */
export function useRemoveSkill(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/employees/${employeeId}/skills/${skillId}`,
      ).then((r) => r.deleted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.skills(employeeId) });
      qc.invalidateQueries({ queryKey: employeeKeys.detail(employeeId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/** GET `/api/employees/:id/memory`. */
export function useEmployeeMemory(
  employeeId: string | null,
  opts: ListMemoryQuery = {},
) {
  return useQuery({
    queryKey: employeeKeys.memory(employeeId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.type) p.set("type", opts.type);
      if (opts.limit) p.set("limit", String(opts.limit));
      const qs = p.toString();
      return apiRequest<{ memory: import("@/lib/employees/client").EmployeeMemory[] }>(
        "GET",
        `/api/employees/${employeeId}/memory${qs ? `?${qs}` : ""}`,
      ).then((r) => r.memory);
    },
    enabled: !!employeeId,
  });
}

/** POST `/api/employees/:id/memory`. */
export function useAddMemory(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemoryInput) =>
      apiRequest<{ memory: import("@/lib/employees/client").EmployeeMemory }>(
        "POST",
        `/api/employees/${employeeId}/memory`,
        input,
      ).then((r) => r.memory),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.memory(employeeId) });
      qc.invalidateQueries({ queryKey: employeeKeys.detail(employeeId) });
    },
  });
}

/** PATCH `/api/employees/:id/memory/:memoryId`. */
export function useUpdateMemory(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      memoryId,
      input,
    }: {
      memoryId: string;
      input: UpdateMemoryInput;
    }) =>
      apiRequest<{ memory: import("@/lib/employees/client").EmployeeMemory }>(
        "PATCH",
        `/api/employees/${employeeId}/memory/${memoryId}`,
        input,
      ).then((r) => r.memory),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.memory(employeeId) });
    },
  });
}

/** DELETE `/api/employees/:id/memory/:memoryId`. */
export function useDeleteMemory(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memoryId: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/employees/${employeeId}/memory/${memoryId}`,
      ).then((r) => r.deleted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.memory(employeeId) });
    },
  });
}

/** GET `/api/employees/:id/memory/search?q=...`. */
export function useSearchMemory(employeeId: string | null, query: string) {
  return useQuery({
    queryKey: ["employees", "memory-search", employeeId, query] as const,
    queryFn: () => {
      const p = new URLSearchParams({ q: query });
      return apiRequest<{ memory: import("@/lib/employees/client").EmployeeMemory[] }>(
        "GET",
        `/api/employees/${employeeId}/memory/search?${p.toString()}`,
      ).then((r) => r.memory);
    },
    enabled: !!employeeId && query.trim().length > 0,
  });
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

/** GET `/api/employees/:id/training`. */
export function useEmployeeTraining(employeeId: string | null) {
  return useQuery({
    queryKey: employeeKeys.training(employeeId),
    queryFn: () =>
      apiRequest<{ training: EmployeeTraining[] }>(
        "GET",
        `/api/employees/${employeeId}/training`,
      ).then((r) => r.training),
    enabled: !!employeeId,
  });
}

/** POST `/api/employees/:id/training` (source: url | document). */
export function useAddTraining(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | ({ source: "url" } & TrainFromUrlInput)
        | ({ source: "document" } & TrainFromDocumentInput),
    ) =>
      apiRequest<{ training: EmployeeTraining }>(
        "POST",
        `/api/employees/${employeeId}/training`,
        input,
      ).then((r) => r.training),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.training(employeeId) });
    },
  });
}

/** DELETE `/api/employees/:id/training/:trainingId`. */
export function useDeleteTraining(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trainingId: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/employees/${employeeId}/training/${trainingId}`,
      ).then((r) => r.deleted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.training(employeeId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/** GET `/api/employees/:id/assignments`. */
export function useEmployeeAssignments(employeeId: string | null) {
  return useQuery({
    queryKey: employeeKeys.assignments(employeeId),
    queryFn: () =>
      apiRequest<{
        assignments: import("@/lib/employees/client").EmployeeAssignment[];
      }>("GET", `/api/employees/${employeeId}/assignments`).then(
        (r) => r.assignments,
      ),
    enabled: !!employeeId,
  });
}

/** POST `/api/employees/:id/assignments`. */
export function useAssignToWorkspace(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignToWorkspaceInput) =>
      apiRequest<{
        assignment: import("@/lib/employees/client").EmployeeAssignment;
      }>("POST", `/api/employees/${employeeId}/assignments`, input).then(
        (r) => r.assignment,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.assignments(employeeId) });
    },
  });
}

/** DELETE `/api/employees/:id/assignments/:assignmentId`. */
export function useUnassign(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      apiRequest<{ removed: boolean }>(
        "DELETE",
        `/api/employees/${employeeId}/assignments/${assignmentId}`,
      ).then((r) => r.removed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.assignments(employeeId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/** GET `/api/employees/:id/performance`. */
export function useEmployeePerformance(
  employeeId: string | null,
  opts: PerformanceQuery = {},
) {
  return useQuery({
    queryKey: employeeKeys.performance(employeeId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.dateFrom) p.set("dateFrom", opts.dateFrom);
      if (opts.dateTo) p.set("dateTo", opts.dateTo);
      const qs = p.toString();
      return apiRequest<{ performance: EmployeePerformance[] }>(
        "GET",
        `/api/employees/${employeeId}/performance${qs ? `?${qs}` : ""}`,
      ).then((r) => r.performance);
    },
    enabled: !!employeeId,
  });
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** GET `/api/employees/:id/versions`. */
export function useEmployeeVersions(employeeId: string | null) {
  return useQuery({
    queryKey: employeeKeys.versions(employeeId),
    queryFn: () =>
      apiRequest<{ versions: EmployeeVersion[] }>(
        "GET",
        `/api/employees/${employeeId}/versions`,
      ).then((r) => r.versions),
    enabled: !!employeeId,
  });
}

/** POST `/api/employees/:id/versions`. */
export function useCreateVersion(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVersionInput) =>
      apiRequest<{ version: EmployeeVersion }>(
        "POST",
        `/api/employees/${employeeId}/versions`,
        input,
      ).then((r) => r.version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.versions(employeeId) });
      qc.invalidateQueries({ queryKey: employeeKeys.detail(employeeId) });
    },
  });
}

/** POST `/api/employees/:id/versions/:version` (restore). */
export function useRestoreVersion(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionNumber: number) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        `/api/employees/${employeeId}/versions/${versionNumber}`,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: employeeKeys.versions(employeeId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** POST `/api/employees/:id/chat`. */
export function useEmployeeChat(employeeId: string | null) {
  return useMutation({
    mutationFn: (message: string) =>
      apiRequest<{ result: EmployeeChatResult }>(
        "POST",
        `/api/employees/${employeeId}/chat`,
        { message },
      ).then((r) => r.result),
  });
}

// ---------------------------------------------------------------------------
// Manager dashboard
// ---------------------------------------------------------------------------

/** GET `/api/employees/dashboard`. */
export function useEmployeeDashboard() {
  return useQuery({
    queryKey: employeeKeys.dashboard,
    queryFn: () =>
      apiRequest<{ dashboard: EmployeeDashboardSummary }>(
        "GET",
        "/api/employees/dashboard",
      ).then((r) => r.dashboard),
    staleTime: 15 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

/** GET `/api/employees/departments`. */
export function useDepartments() {
  return useQuery({
    queryKey: employeeKeys.departments,
    queryFn: () =>
      apiRequest<{ departments: EmployeeDepartment[] }>(
        "GET",
        "/api/employees/departments",
      ).then((r) => r.departments),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Skill catalog
// ---------------------------------------------------------------------------

/** GET `/api/employees/skills`. */
export function useSkillCatalog() {
  return useQuery({
    queryKey: employeeKeys.catalog,
    queryFn: () =>
      apiRequest<{
        skills: SkillDefinition[];
        categories: Array<{ id: SkillCategory; label: string; count: number }>;
        version: number;
      }>("GET", "/api/employees/skills").then((r) => ({
        skills: r.skills,
        categories: r.categories,
        version: r.version,
      })),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

/** GET `/api/employees/marketplace`. */
export function useMarketplace(opts: ListMarketplaceQuery = {}) {
  return useQuery({
    queryKey: employeeKeys.marketplace(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.category) p.set("category", opts.category);
      if (opts.search) p.set("search", opts.search);
      if (opts.featured !== undefined) p.set("featured", String(opts.featured));
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ entries: EmployeeMarketplaceEntry[] }>(
        "GET",
        `/api/employees/marketplace${qs ? `?${qs}` : ""}`,
      ).then((r) => r.entries);
    },
    staleTime: 30 * 1000,
  });
}

/** GET `/api/employees/marketplace/:id`. */
export function useMarketplaceEntry(id: string | null) {
  return useQuery({
    queryKey: employeeKeys.marketplaceEntry(id),
    queryFn: () =>
      apiRequest<{ entry: EmployeeMarketplaceEntry }>(
        "GET",
        `/api/employees/marketplace/${id}`,
      ).then((r) => r.entry),
    enabled: !!id,
  });
}

/** POST `/api/employees/marketplace/:id` (publish / update). */
export function usePublishToMarketplace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      employeeId,
      input,
    }: {
      employeeId: string;
      input: PublishToMarketplaceInput;
    }) =>
      apiRequest<{ entry: EmployeeMarketplaceEntry }>(
        "POST",
        `/api/employees/marketplace/${employeeId}`,
        input,
      ).then((r) => r.entry),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", "marketplace"] });
    },
  });
}

/** POST `/api/employees/marketplace/:id/install`. */
export function useInstallFromMarketplace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (marketplaceId: string) =>
      apiRequest<{ employee: EmployeeWithRelations }>(
        "POST",
        `/api/employees/marketplace/${marketplaceId}/install`,
      ).then((r) => r.employee),
    onSuccess: (employee) => {
      qc.setQueryData(employeeKeys.detail(employee.id), { employee });
      qc.invalidateQueries({ queryKey: ["employees", "list"] });
      qc.invalidateQueries({ queryKey: ["employees", "marketplace"] });
      qc.invalidateQueries({ queryKey: employeeKeys.dashboard });
    },
  });
}

/** POST `/api/employees/marketplace/:id/rate`. */
export function useRateMarketplaceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      marketplaceId,
      rating,
    }: {
      marketplaceId: string;
      rating: 1 | 2 | 3 | 4 | 5;
    }) =>
      apiRequest<{ entry: EmployeeMarketplaceEntry }>(
        "POST",
        `/api/employees/marketplace/${marketplaceId}/rate`,
        { rating },
      ).then((r) => r.entry),
    onSuccess: (entry) => {
      qc.setQueryData(employeeKeys.marketplaceEntry(entry.id), { entry });
      qc.invalidateQueries({ queryKey: ["employees", "marketplace"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Inter-employee messages
// ---------------------------------------------------------------------------

/** GET `/api/employees/messages`. */
export function useEmployeeMessages(
  opts: { fromId?: string; toId?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: employeeKeys.messages(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.fromId) p.set("fromId", opts.fromId);
      if (opts.toId) p.set("toId", opts.toId);
      if (opts.limit) p.set("limit", String(opts.limit));
      const qs = p.toString();
      return apiRequest<{ messages: EmployeeMessage[] }>(
        "GET",
        `/api/employees/messages${qs ? `?${qs}` : ""}`,
      ).then((r) => r.messages);
    },
    staleTime: 5 * 1000,
  });
}

/** POST `/api/employees/messages`. */
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fromEmployeeId,
      toEmployeeId,
      input,
    }: {
      fromEmployeeId: string;
      toEmployeeId: string;
      input: SendMessageInput;
    }) =>
      apiRequest<{ message: EmployeeMessage }>(
        "POST",
        "/api/employees/messages",
        {
          fromEmployeeId,
          toEmployeeId,
          ...input,
        },
      ).then((r) => r.message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", "messages"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type {
  EmployeeWithRelations,
  EmployeeSkill,
  EmployeePerformance,
  EmployeeMessage,
  EmployeeMarketplaceEntry,
  EmployeeVersion,
  EmployeeDashboardSummary,
  EmployeeChatResult,
  MemoryType,
} from "@/lib/employees/client";
