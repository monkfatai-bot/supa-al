import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimit, getRateLimitStatus } from '@/lib/rate-limit';

describe('Rate Limiter', () => {
  beforeEach(() => {
    resetRateLimit('test-key');
    resetRateLimit('limited-key');
    resetRateLimit('window-key');
  });

  it('allows requests under the limit', () => {
    const result = rateLimit('test-key', { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('counts down remaining correctly', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('test-key', { limit: 5, windowSeconds: 60 });
    }
    const result = rateLimit('test-key', { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('rejects requests at the limit', () => {
    for (let i = 0; i < 10; i++) {
      rateLimit('limited-key', { limit: 5, windowSeconds: 60 });
    }
    const result = rateLimit('limited-key', { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('uses default limit of 10 when no options provided', () => {
    for (let i = 0; i < 10; i++) {
      rateLimit('limited-key');
    }
    const result = rateLimit('limited-key');
    expect(result.success).toBe(false);
  });

  it('returns a valid resetAt timestamp', () => {
    const before = Date.now();
    const result = rateLimit('test-key', { limit: 5, windowSeconds: 60 });
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_000);
  });

  it('resetRateLimit clears the counter', () => {
    for (let i = 0; i < 9; i++) {
      rateLimit('limited-key', { limit: 5, windowSeconds: 60 });
    }
    resetRateLimit('limited-key');
    const result = rateLimit('limited-key', { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('getRateLimitStatus returns null for unknown key', () => {
    const status = getRateLimitStatus('nonexistent');
    expect(status).toBeNull();
  });

  it('getRateLimitStatus returns remaining without incrementing', () => {
    rateLimit('test-key', { limit: 5, windowSeconds: 60 });
    const status = getRateLimitStatus('test-key', 5);
    expect(status).not.toBeNull();
    expect(status!.remaining).toBe(4);

    // Calling again should not decrement
    const status2 = getRateLimitStatus('test-key', 5);
    expect(status2!.remaining).toBe(4);
  });
});
