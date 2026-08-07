/**
 * Supa AI — Phase 9C Employees — full barrel (server-only).
 *
 * Re-exports the client-safe types + skill registry *plus* the
 * server-only {@link EmployeeService}. Importing this barrel from a
 * Client Component will throw at build time — client code MUST import
 * from `@/lib/employees/client` instead.
 *
 * @module @/lib/employees
 */
import "server-only";

export * from "./client";
export {
  EmployeeService,
  createEmployeeService,
} from "./employee-service";
