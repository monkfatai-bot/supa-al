/**
 * Supa AI — Usage tracking (billing).
 *
 * Records per-call token usage and exposes a summary aggregation. In Phase 1
 * the persistence layer (Supabase) is owned by another agent, so this module
 * accepts a pluggable `UsageRecorder` callback that the DB agent wires up.
 * Until then, usage is buffered in an in-memory ring (best-effort, dev only).
 *
 * Server-only.
 *
 * @module @/lib/billing/usage
 */
import { logger } from "@/lib/logger";

export interface BillingUsageRecord {
  orgId?: string;
  userId?: string;
  feature?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCents: number;
  timestamp: number;
}

export interface UsageRecorder {
  (record: BillingUsageRecord): void | Promise<void>;
}

export interface UsagePeriod {
  /** Inclusive start (epoch ms). */
  start: number;
  /** Exclusive end (epoch ms). */
  end: number;
}

export interface UsageSummary {
  orgId?: string;
  period: UsagePeriod;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostCents: number;
  byFeature: Record<string, { calls: number; tokens: number; costCents: number }>;
  byModel: Record<string, { calls: number; tokens: number; costCents: number }>;
}

/** Build a period covering the current calendar month (UTC). */
export function currentMonthPeriod(now = new Date()): UsagePeriod {
  return {
    start: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    end: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  };
}

const RING_SIZE = 1_000;

class InMemoryRing {
  private buf: BillingUsageRecord[] = [];
  private head = 0;

  push(rec: BillingUsageRecord): void {
    if (this.buf.length < RING_SIZE) {
      this.buf.push(rec);
    } else {
      this.buf[this.head] = rec;
      this.head = (this.head + 1) % RING_SIZE;
    }
  }

  forOrg(orgId: string | undefined, period: UsagePeriod): BillingUsageRecord[] {
    return this.buf.filter(
      (r) =>
        (orgId === undefined || r.orgId === orgId) &&
        r.timestamp >= period.start &&
        r.timestamp < period.end,
    );
  }
}

let recorder: UsageRecorder | null = null;
const ring = new InMemoryRing();

/** Plug in a custom recorder (e.g. one that writes to Supabase). */
export function setUsageRecorder(fn: UsageRecorder | null): void {
  recorder = fn;
}

/**
 * Record a usage event. Calls the plugged-in recorder (if any) and always
 * buffers into the in-memory ring for dev visibility.
 */
export async function recordUsage(
  input: Omit<BillingUsageRecord, "timestamp"> & { timestamp?: number },
): Promise<void> {
  const rec: BillingUsageRecord = {
    ...input,
    timestamp: input.timestamp ?? Date.now(),
  };
  ring.push(rec);
  if (recorder) {
    try {
      await recorder(rec);
    } catch (err) {
      logger.warn("Usage recorder threw; buffered in-memory only.", {
        error: String(err),
        provider: rec.provider,
      });
    }
  } else {
    // No DB recorder attached (foundation phase). Log so usage is visible.
    logger.debug("Usage recorded (memory only)", {
      orgId: rec.orgId,
      feature: rec.feature,
      model: rec.model,
      tokens: rec.totalTokens,
      costCents: rec.costCents,
    });
  }
}

/**
 * Aggregate usage for an org over a period. Phase 1 uses the in-memory ring;
 * once the Supabase recorder is wired in, this should query the DB instead.
 */
export async function getUsage(
  orgId: string | undefined,
  period: UsagePeriod,
): Promise<UsageSummary> {
  const records = ring.forOrg(orgId, period);
  const summary: UsageSummary = {
    orgId,
    period,
    totalCalls: records.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCostCents: 0,
    byFeature: {},
    byModel: {},
  };
  for (const r of records) {
    summary.totalInputTokens += r.inputTokens;
    summary.totalOutputTokens += r.outputTokens;
    summary.totalTokens += r.totalTokens;
    summary.totalCostCents += r.costCents;
    const feat = r.feature ?? "unknown";
    const f = (summary.byFeature[feat] ??= { calls: 0, tokens: 0, costCents: 0 });
    f.calls += 1;
    f.tokens += r.totalTokens;
    f.costCents += r.costCents;
    const m = (summary.byModel[r.model] ??= { calls: 0, tokens: 0, costCents: 0 });
    m.calls += 1;
    m.tokens += r.totalTokens;
    m.costCents += r.costCents;
  }
  return summary;
}
