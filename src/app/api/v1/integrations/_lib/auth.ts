/**
 * Shared API key authentication helper for v1 integration routes.
 * Extracts Bearer token, validates against the API key manager,
 * and increments usage.
 */

import { NextRequest } from "next/server";
import { validateApiKey as validateKey, incrementKeyUsage } from "@/services/integration-hub/api-key-manager";

export interface AuthResult {
  workspaceId: string;
  permissions: string[];
  keyId?: string;
}

export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    throw new ApiAuthError("Missing Authorization header.", 401);
  }

  let apiKey = authHeader;
  if (authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.substring(7).trim();
  }
  apiKey = apiKey.trim();

  if (!apiKey.startsWith("sk_live_")) {
    throw new ApiAuthError("Invalid API key format.", 401);
  }

  const result = await validateKey(apiKey);

  if (!result.valid || !result.workspaceId) {
    throw new ApiAuthError("Invalid or expired API key.", 401);
  }

  if (result.keyId) {
    incrementKeyUsage(result.keyId).catch(() => {
      /* fire-and-forget */
    });
  }

  return {
    workspaceId: result.workspaceId,
    permissions: (result.permissions as string[]) ?? [],
    keyId: result.keyId,
  };
}

export class ApiAuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "ApiAuthError";
  }
}
