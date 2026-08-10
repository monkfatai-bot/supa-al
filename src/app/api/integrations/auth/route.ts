import { NextRequest, NextResponse } from "next/server";
import { validateApiKey as validateKey, incrementKeyUsage } from "@/services/integration-hub/api-key-manager";

interface ApiKeyValidationResult {
  valid: boolean;
  workspaceId?: string;
  permissions?: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json(
        { valid: false, error: "Missing Authorization header." },
        { status: 401 }
      );
    }

    let apiKey = authHeader;
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    }
    apiKey = apiKey.trim();

    if (!apiKey.startsWith("sk_live_")) {
      return NextResponse.json(
        { valid: false, error: "Invalid API key format." },
        { status: 401 }
      );
    }

    const result = await validateKey(apiKey);

    if (!result.valid || !result.workspaceId) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired API key." },
        { status: 401 }
      );
    }

    if (result.keyId) {
      incrementKeyUsage(result.keyId);
    }

    return NextResponse.json({
      valid: true,
      workspaceId: result.workspaceId,
      permissions: (result.permissions as string[]) ?? [],
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Internal validation error." },
      { status: 500 }
    );
  }
}

export async function validateApiKey(
  request: Request
): Promise<ApiKeyValidationResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header." };
  }

  let apiKey = authHeader;
  if (authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.substring(7).trim();
  }
  apiKey = apiKey.trim();

  if (!apiKey.startsWith("sk_live_")) {
    return { valid: false, error: "Invalid API key format." };
  }

  const result = await validateKey(apiKey);

  if (!result.valid || !result.workspaceId) {
    return { valid: false, error: "Invalid or expired API key." };
  }

  if (result.keyId) {
    incrementKeyUsage(result.keyId);
  }

  return {
    valid: true,
    workspaceId: result.workspaceId,
    permissions: (result.permissions as string[]) ?? [],
  };
}
