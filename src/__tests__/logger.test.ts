import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '@/services/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has all four log level methods', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('debug does not throw', () => {
    expect(() => logger.debug('test message')).not.toThrow();
  });

  it('info does not throw', () => {
    expect(() => logger.info('test message')).not.toThrow();
  });

  it('warn does not throw', () => {
    expect(() => logger.warn('test message')).not.toThrow();
  });

  it('error does not throw', () => {
    expect(() => logger.error('test message')).not.toThrow();
  });

  it('accepts metadata object', () => {
    expect(() => logger.info('with meta', { key: 'value', num: 42 })).not.toThrow();
  });

  it('accepts error object as metadata', () => {
    const err = new Error('test error');
    expect(() => logger.error('failed', { error: err.message, stack: err.stack })).not.toThrow();
  });

  it('handles empty string message', () => {
    expect(() => logger.info('')).not.toThrow();
  });
});
