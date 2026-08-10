// One-time initialization for automation registries.
// Called from the root layout to ensure handlers are available.
let initialized = false;
export async function ensureAutomationInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
  // Dynamic imports to avoid circular dependencies and only load when needed
  const { registerBuiltinActions } = await import("@/services/automation/actions/handlers");
  const { registerBuiltinTriggers } = await import("@/services/automation/triggers/event-handlers");
  registerBuiltinActions();
  registerBuiltinTriggers();
}
