/**
 * Supa AI — Phase 11 marketing Zod schemas.
 *
 * Validation rules for the public marketing endpoints:
 * newsletter subscribe, demo requests, contact messages, referrals, and
 * list/search query params for the blog, docs, and changelog routes.
 *
 * Infer types from these schemas (rather than redeclaring interfaces) so
 * the runtime contract and the TypeScript type can never drift apart.
 *
 * @module @/lib/validation/marketing
 */
import { z } from "zod";

import { slugSchema, sortDirectionSchema } from "@/lib/validation/common";

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

/** Email schema reused across every public marketing form. */
export const marketingEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.")
  .max(254, "Email must be at most 254 characters.");

/** Newsletter subscribe payload. */
export const subscribeSchema = z
  .object({
    email: marketingEmailSchema,
    name: z
      .string()
      .trim()
      .min(1, "Name must be at least 1 character.")
      .max(120, "Name must be at most 120 characters.")
      .optional(),
    source: z
      .string()
      .trim()
      .max(64, "Source must be at most 64 characters.")
      .optional(),
  })
  .strict();

export type SubscribeInput = z.infer<typeof subscribeSchema>;

// ---------------------------------------------------------------------------
// Demo requests
// ---------------------------------------------------------------------------

/** Team-size bucket labels shown on the demo-request form. */
export const teamSizeSchema = z.enum([
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
]);

/** Public demo-request payload. */
export const createDemoRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(120, "Name must be at most 120 characters."),
    email: marketingEmailSchema,
    company: z
      .string()
      .trim()
      .max(120, "Company must be at most 120 characters.")
      .optional(),
    phone: z
      .string()
      .trim()
      .max(40, "Phone must be at most 40 characters.")
      .optional(),
    teamSize: teamSizeSchema.optional(),
    useCase: z
      .string()
      .trim()
      .max(500, "Use case must be at most 500 characters.")
      .optional(),
    message: z
      .string()
      .trim()
      .max(2_000, "Message must be at most 2000 characters.")
      .optional(),
  })
  .strict();

export type CreateDemoRequestInput = z.infer<typeof createDemoRequestSchema>;

// ---------------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------------

export const contactCategorySchema = z.enum([
  "general",
  "sales",
  "support",
  "partnership",
  "press",
  "security",
  "other",
]);

/** Public contact-message payload. */
export const createContactMessageSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(120, "Name must be at most 120 characters."),
    email: marketingEmailSchema,
    subject: z
      .string()
      .trim()
      .max(200, "Subject must be at most 200 characters.")
      .optional(),
    message: z
      .string()
      .trim()
      .min(10, "Message must be at least 10 characters.")
      .max(5_000, "Message must be at most 5000 characters."),
    category: contactCategorySchema.optional(),
  })
  .strict();

export type CreateContactMessageInput = z.infer<
  typeof createContactMessageSchema
>;

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

/**
 * Referral code: 8–32 chars, alphanumerics + dashes only. The generator
 * produces `XXXX-XXXX-XXXX` 12-hex strings; we accept any well-formed code.
 */
export const referralCodeSchema = z
  .string()
  .trim()
  .min(6, "Referral code is too short.")
  .max(64, "Referral code is too long.")
  .regex(
    /^[A-Za-z0-9-]+$/,
    "Referral code must contain only letters, digits, and hyphens.",
  );

/** Public referral-create payload. */
export const createReferralSchema = z
  .object({
    referrerEmail: marketingEmailSchema,
    referredEmail: marketingEmailSchema.optional(),
    source: z
      .string()
      .trim()
      .max(64, "Source must be at most 64 characters.")
      .optional(),
  })
  .strict();

export type CreateReferralInput = z.infer<typeof createReferralSchema>;

// ---------------------------------------------------------------------------
// List / search query params
// ---------------------------------------------------------------------------

/** Blog post list query: ?limit=&cursor=&category=&tag=&featured=&sort= */
export const listBlogPostsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
    category: slugSchema.optional(),
    tag: slugSchema.optional(),
    featured: z.coerce.boolean().optional(),
    sort: sortDirectionSchema.optional(),
  })
  .strict();

export type ListBlogPostsQuery = z.infer<typeof listBlogPostsQuerySchema>;

/** Documentation list query: ?limit=&cursor=&category=&section=&sort= */
export const listDocsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(512).optional(),
    category: z
      .string()
      .trim()
      .max(64)
      .optional(),
    section: z
      .string()
      .trim()
      .max(64)
      .optional(),
    sort: sortDirectionSchema.optional(),
  })
  .strict();

export type ListDocsQuery = z.infer<typeof listDocsQuerySchema>;

/**
 * Cross-content search query: ?q=&limit=&kinds=
 *
 * `kinds` is an optional comma-separated allowlist restricting which content
 * kinds to search (blog, docs, changelog). When omitted, all kinds are
 * searched.
 */
export const searchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, "Search query is required.")
      .max(200, "Search query must be at most 200 characters."),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    kinds: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v): Set<"blog" | "docs" | "changelog"> | undefined => {
        if (!v) return undefined;
        const allowed = new Set(["blog", "docs", "changelog"] as const);
        const set = new Set<"blog" | "docs" | "changelog">();
        for (const part of v.split(",")) {
          const trimmed = part.trim().toLowerCase();
          if (
            trimmed &&
            (trimmed === "blog" ||
              trimmed === "docs" ||
              trimmed === "changelog")
          ) {
            set.add(trimmed);
          }
        }
        return set.size === 0 ? undefined : set;
      }),
  })
  .strict();

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Re-export for callers that want the underlying slug regex. */
export { slugSchema };
