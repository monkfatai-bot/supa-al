// ── Actions ──────────────────────────────────────────────────────────────────

export {
  // CRUD
  createEmployee,
  updateEmployee,
  deleteEmployee,
  archiveEmployee,
  cloneEmployee,
  // Queries
  getEmployees,
  getEmployee,
  getEmployeeProfile,
  // Assignments
  hireEmployee,
  updateEmployeeStatus,
  // Directory & Dashboard
  getEmployeeDirectory,
  getEmployeeDashboard,
  // Skills
  getEmployeeSkills,
  addEmployeeSkill,
  removeEmployeeSkill,
  // Memory
  getEmployeeMemory,
  addEmployeeMemory,
  clearEmployeeMemory,
  // Training
  trainEmployee,
  getEmployeeTraining,
  // Performance
  getEmployeePerformance,
  recordEmployeePerformance,
  // Marketplace
  getMarketplaceEmployees,
  installMarketplaceEmployee,
  rateMarketplaceEmployee,
  // Messaging
  getEmployeeMessages,
  sendEmployeeMessage,
} from "./actions";

// ── Types ────────────────────────────────────────────────────────────────────

export type {
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  AddSkillRequest,
  AddMemoryRequest,
  AddTrainingRequest,
  RecordPerformanceMetrics,
  EmployeeWithSkills,
  EmployeeFullProfile,
  EmployeeListOptions,
  EmployeeDirectoryOptions,
  MarketplaceListOptions,
  EmployeeDashboardStats,
  PaginatedEmployeeResponse,
  EmployeeActionResponse,
} from "./types";

export type {
  EmployeeStatus,
  EmployeeExperienceLevel,
  EmployeeMemoryScope,
  EmployeeTrainingType,
  EmployeeTrainingStatus,
  EmployeeAssignmentType,
  EmployeeAssignmentStatus,
  AiEmployee,
  EmployeeSkill,
  EmployeeMemory,
  EmployeeTraining,
  EmployeeDepartment,
  EmployeeAssignment,
  EmployeePerformance,
  EmployeeMessage,
  EmployeeMarketplace,
  EmployeeVersion,
} from "./types";
