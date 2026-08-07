/**
 * Supa AI — Phase 9C skill catalog route.
 *
 * GET `/api/employees/skills` — list all skills in the catalog
 * (15+ pre-defined skills across 7 categories). Used by the
 * directory's "Add skill" picker and the manager's per-employee
 * skill configuration UI.
 *
 * Public read: any authenticated user can browse the catalog.
 *
 * @module @/app/api/employees/skills/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import {
  SKILL_CATALOG_VERSION,
  SKILL_CATEGORY_LABELS,
  skillRegistry,
} from "@/lib/employees/client";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();

    const skills = skillRegistry.list();
    const categories = skillRegistry.categories().map((c) => ({
      id: c,
      label: SKILL_CATEGORY_LABELS[c],
      count: skillRegistry.listByCategory(c).length,
    }));

    return apiSuccess({
      skills,
      categories,
      version: SKILL_CATALOG_VERSION,
    });
  } catch (err) {
    return apiError(err);
  }
}
