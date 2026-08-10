import { describe, it, expect } from 'vitest';
import { cn, getInitials } from '@/lib/utils';

describe('cn utility', () => {
  it('merges class names', () => {
    const result = cn('text-sm', 'font-bold');
    expect(result).toContain('text-sm');
    expect(result).toContain('font-bold');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'visible');
    expect(result).toContain('base');
    expect(result).toContain('visible');
    expect(result).not.toContain('hidden');
  });
});

describe('getInitials', () => {
  it('returns U for null', () => {
    expect(getInitials(null)).toBe('U');
  });

  it('returns first letter for single name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('returns first and last initials for two-part name', () => {
    expect(getInitials('Alice Smith')).toBe('AS');
  });

  it('handles three-part names by taking first and last', () => {
    expect(getInitials('Alice B Carter')).toBe('AC');
  });

  it('trims whitespace', () => {
    expect(getInitials('  Alice Smith  ')).toBe('AS');
  });

  it('uppercases the result', () => {
    expect(getInitials('alice smith')).toBe('AS');
  });
});
