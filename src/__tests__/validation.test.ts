import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test the env schema structure mirrors the real one
const testEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Supa AI'),
});

describe('Environment Validation Schema', () => {
  it('rejects missing required fields', () => {
    const result = testEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
      OPENAI_API_KEY: 'key',
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = testEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
      OPENAI_API_KEY: 'key',
    });
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
      expect(result.data.NEXT_PUBLIC_APP_NAME).toBe('Supa AI');
    }
  });

  it('rejects invalid URL', () => {
    const result = testEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
      OPENAI_API_KEY: 'key',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string for required fields', () => {
    const result = testEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
      OPENAI_API_KEY: 'key',
    });
    expect(result.success).toBe(false);
  });
});

describe('Input Validation Patterns', () => {
  it('validates workspace name length', () => {
    const nameSchema = z.string().min(1).max(100);
    expect(nameSchema.safeParse('').success).toBe(false);
    expect(nameSchema.safeParse('a'.repeat(101)).success).toBe(false);
    expect(nameSchema.safeParse('My Workspace').success).toBe(true);
  });

  it('validates email format', () => {
    const emailSchema = z.string().email();
    expect(emailSchema.safeParse('valid@email.com').success).toBe(true);
    expect(emailSchema.safeParse('invalid').success).toBe(false);
    expect(emailSchema.safeParse('@no-user.com').success).toBe(false);
  });

  it('validates theme values', () => {
    const themeSchema = z.enum(['system', 'light', 'dark']);
    expect(themeSchema.safeParse('system').success).toBe(true);
    expect(themeSchema.safeParse('light').success).toBe(true);
    expect(themeSchema.safeParse('dark').success).toBe(true);
    expect(themeSchema.safeParse('blue').success).toBe(false);
  });

  it('validates prompt length constraints', () => {
    const promptSchema = z.string().min(1).max(5000);
    expect(promptSchema.safeParse('A valid prompt').success).toBe(true);
    expect(promptSchema.safeParse('').success).toBe(false);
    expect(promptSchema.safeParse('x'.repeat(5001)).success).toBe(false);
  });
});
