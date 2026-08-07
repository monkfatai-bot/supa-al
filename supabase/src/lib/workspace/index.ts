/**
 * Supa AI — Phase 9 Workspace — full barrel (server-only).
 *
 * Re-exports the client-safe types + constants *plus* every server-only
 * service factory. Importing this barrel from a Client Component will
 * throw at build time — client code MUST import from
 * `@/lib/workspace/client` instead.
 *
 * ## CRITICAL — Phase 10 contract
 *
 * Phase 10 (`@/lib/integrations/core`) imports `assertMember`,
 * `assertRole`, `assertCanWrite`, `assertCanAdmin`, `slugify`, `toJson`,
 * `toDbError`, `wrapUnexpected`, `WRITE_ROLES`, and `ADMIN_ROLES` from
 * `@/lib/workspace/core` (or this barrel via a thin re-export). Do NOT
 * rename, move, or remove those exports without coordinating with Phase 10.
 *
 * @module @/lib/workspace
 */
import "server-only";

export * from "./client";
export {
  // Role constants
  WRITE_ROLES,
  ADMIN_ROLES,
  // Membership + role enforcement
  assertMember,
  assertRole,
  assertCanWrite,
  assertCanAdmin,
  findMembership,
  // Helpers
  slugify,
  toJson,
  toDbError,
  wrapUnexpected,
  notFound,
  validationError,
  // Re-exported error classes (convenience)
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  ValidationError,
  // PostgrestErrorLike type
  type PostgrestErrorLike,
} from "./core";

export {
  WorkspaceService,
  createWorkspaceService,
  createWorkspaceServiceAdmin,
} from "./workspace-service";

export { FolderService, createFolderService } from "./folder-service";
export { DocumentService, createDocumentService } from "./document-service";
export { VersionService, createVersionService } from "./version-service";
export { CommentService, createCommentService } from "./comment-service";
export { KnowledgeService, createKnowledgeService } from "./knowledge-service";
export { FileService, createFileService, STORAGE_BUCKET } from "./file-service";
export { MemberService, createMemberService } from "./member-service";
export { MentionService, createMentionService } from "./mention-service";
export { ActivityService, createActivityService } from "./activity-service";
export { SearchService, createSearchService } from "./search-service";
export { AiAssistant, createAiAssistant } from "./ai-assistant";
