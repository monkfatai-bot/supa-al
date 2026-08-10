import { NextResponse } from "next/server";
import { processScheduledJobs } from "@/services/automation/scheduler";

// Simple in-memory rate limiter: allow at most 1 tick per 30 seconds
let lastTickTime = 0;
const RATE_LIMIT_MS = 30_000;

export async function POST() {
  const now = Date.now();
  if (now - lastTickTime < RATE_LIMIT_MS) {
    return NextResponse.json(
      { success: false, error: "Rate limited" },
      { status: 429 },
    );
  }
  lastTickTime = now;

  try {
    const result = await processScheduledJobs();
    return NextResponse.json({ success: true, processed: result.processed, errors: result.errors });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
