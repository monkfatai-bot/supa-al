/**
 * Supa AI — common Zod schemas.
 *
 * Reusable schemas for IDs, UUIDs, slugs, URLs, pagination, and search
 * queries. Centralizing them here keeps validation rules consistent across
 * API routes and Server Actions, and gives us one place to evolve them.
 *
 * @module @/lib/validation/common
 */

import { z } from "zod";

import type { ID, PaginationParams, SortDirection, UUID } from "@/types/common";

/**
 * UUID v4/v7 schema. Use for primary keys coming from Supabase / Postgres.
 * Returns the validated string branded as a {@link UUID}.
 */
export const uuidSchema = z
  .uuid()
  .transform((value): UUID => value as UUID);

/**
 * Opaque resource ID. A non-empty string branded as an {@link ID} so it
 * cannot be silently swapped with arbitrary text at compile time.
 */
export const idSchema = z
  .string()
  .min(1, "ID must be a non-empty string.")
  .max(256, "ID must be at most 256 characters.")
  .brand<"ID">();

export type IdInput = z.input<typeof idSchema>;
export type IdOutput = z.output<typeof idSchema>;

/**
 * URL-friendly slug: lowercase alphanumerics joined by single hyphens.
 * Example: `my-cool-project`.
 */
export const slugSchema = z
  .string()
  .min(1, "Slug is required.")
  .max(128, "Slug must be at most 128 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric, separated by single hyphens.",
  );

/** Absolute http(s) URL. */
export const urlSchema = z.url("Please provide a valid URL.");

/** Sort direction accepted by paginated endpoints. */
export const sortDirectionSchema = z.enum(["asc", "desc"]);

/**
 * Standard pagination schema. Mirrors {@link PaginationParams} with the
 * platform-wide defaults: `limit = 20` (1–100), optional `cursor`,
 * optional sort controls.
 */
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(512).optional(),
  sort: sortDirectionSchema.optional(),
  sortBy: z.string().min(1).max(64).optional(),
});

/** Inferred pagination input (before defaults applied). */
export type PaginationInput = z.input<typeof paginationSchema>;
/** Inferred pagination output (after defaults applied). */
export type PaginationOutput = z.output<typeof paginationSchema>;

/** Search query input for list/search endpoints. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required.").max(200),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(512).optional(),
  sort: sortDirectionSchema.optional(),
});

export type SearchQueryInput = z.input<typeof searchQuerySchema>;
export type SearchQueryOutput = z.output<typeof searchQuerySchema>;

export type { ID, PaginationParams, SortDirection, UUID };
