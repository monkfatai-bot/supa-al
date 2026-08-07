/**
 * Supa AI — Phase 5 AI Video — client-safe barrel.
 *
 * Re-exports ONLY types and client-safe constants from the video
 * domain. **No `server-only` modules** live behind this barrel, so
 * Client Components can import from here without triggering the
 * `'server-only' cannot be imported from a Client Component` error.
 *
 * Client components MUST import from `@/lib/video/client`, NOT
 * `@/lib/video`. The full barrel (`@/lib/video`) pulls in
 * `video-service.ts` which imports `server-only`.
 *
 * @module @/lib/video/client
 */
export * from "./types";
