/**
 * Configuration barrel.
 *
 * Re-exports the validated `env` object. Add non-secret runtime configuration
 * (feature defaults, app metadata) as separate modules here rather than
 * scattering `process.env` reads across the codebase.
 *
 * @module @/lib/config
 */
export { env, type Env, type EnvSchema } from "./env";
