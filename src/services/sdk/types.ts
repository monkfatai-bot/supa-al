/**
 * Extension SDK Service Types
 */


// ─── Request Types ──────────────────────────────────────────

export interface CreateSdkPackageRequest {
  name: string;
  description?: string;
  version: string;
  author?: string;
  manifest: Record<string, unknown>;
}

export interface UpdateSdkPackageRequest {
  slug: string;
  updates: Partial<{
    name: string;
    description: string;
    version: string;
    author: string;
    manifest: Record<string, unknown>;
    package_url: string;
    checksum: string;
    status: string;
  }>;
}

// ─── Response Types ─────────────────────────────────────────

export interface SdkActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SdkDocumentation {
  title: string;
  version: string;
  sections: {
    heading: string;
    content: string;
  }[];
}

// ─── Manifest Validation ──────────────────────────────────

const REQUIRED_MANIFEST_FIELDS = ["name", "version", "type", "permissions", "entryPoint"] as const;

export function validateManifest(
  manifest: Record<string, unknown>
): ManifestValidationResult {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Manifest must be a non-null object."] };
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest) || manifest[field] == null) {
      errors.push(`Missing required field: '${field}'.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
