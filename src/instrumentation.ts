/**
 * Supa AI — Server bootstrap (runs once on server start).
 *
 * Initializes cross-module integrations that need to register event
 * subscriptions at server boot. Uses Next.js instrumentation hook.
 *
 * @module src/instrumentation
 */
export async function register(): Promise<void> {
  // Only run on the server (not during build).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { initializeInternalModuleIntegration } = await import("@/lib/integrations/internal-modules");
      initializeInternalModuleIntegration();
    } catch {
      // Integration module may not be available yet — fail gracefully.
    }
  }
}
