/**
 * Supa AI — Phase 8 Voice — client-safe barrel.
 *
 * Re-exports ONLY types and client-safe constants from the voice
 * domain. **No `server-only` modules** live behind this barrel, so
 * Client Components can import from here without triggering the
 * `'server-only' cannot be imported from a Client Component` error.
 *
 * Client components MUST import from `@/lib/voice/client`, NOT
 * `@/lib/voice`. The full barrel (`@/lib/voice`) pulls in
 * `voice-service.ts` which imports `server-only`.
 *
 * @module @/lib/voice/client
 */
export * from "./types";
