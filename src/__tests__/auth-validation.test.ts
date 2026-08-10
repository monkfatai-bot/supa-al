import { describe, it, expect } from 'vitest';
import {
  passwordSchema,
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  changeEmailSchema,
  deleteAccountSchema,
  updateProfileSchema,
} from '@/services/auth/validation';

describe('Password Schema', () => {
  it('accepts valid password', () => {
    expect(passwordSchema.safeParse('Password1!').success).toBe(true);
  });

  it('rejects short password', () => {
    expect(passwordSchema.safeParse('Pass1!').success).toBe(false);
  });

  it('rejects without uppercase', () => {
    expect(passwordSchema.safeParse('password1!').success).toBe(false);
  });

  it('rejects without lowercase', () => {
    expect(passwordSchema.safeParse('PASSWORD1!').success).toBe(false);
  });

  it('rejects without number', () => {
    expect(passwordSchema.safeParse('Password!!').success).toBe(false);
  });
});

describe('Signup Schema', () => {
  it('accepts valid signup', () => {
    const result = signupSchema.safeParse({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'Password1!',
      confirmPassword: 'Password1!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = signupSchema.safeParse({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'Password1!',
      confirmPassword: 'Different1!',
    });
    expect(result.success).toBe(false);
  });

  it('trims and lowercases email', () => {
    const result = signupSchema.safeParse({
      fullName: 'Test',
      email: '  TEST@Example.COM  ',
      password: 'Password1!',
      confirmPassword: 'Password1!',
    });
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });
});

describe('Login Schema', () => {
  it('accepts valid login', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'anypassword',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'anypassword',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('Change Password Schema', () => {
  it('accepts valid change', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
      confirmPassword: 'NewPass1!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched confirm', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
      confirmPassword: 'Different1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects same password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'SamePass1!',
      newPassword: 'SamePass1!',
      confirmPassword: 'SamePass1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty current password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'NewPass1!',
      confirmPassword: 'NewPass1!',
    });
    expect(result.success).toBe(false);
  });
});

describe('Change Email Schema', () => {
  it('accepts valid change', () => {
    const result = changeEmailSchema.safeParse({
      newEmail: 'new@example.com',
      confirmEmail: 'new@example.com',
      password: 'anypassword',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched emails', () => {
    const result = changeEmailSchema.safeParse({
      newEmail: 'new@example.com',
      confirmEmail: 'other@example.com',
      password: 'anypassword',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = changeEmailSchema.safeParse({
      newEmail: 'new@example.com',
      confirmEmail: 'new@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('Delete Account Schema', () => {
  it('accepts DELETE confirmation', () => {
    const result = deleteAccountSchema.safeParse({ confirmation: 'DELETE' });
    expect(result.success).toBe(true);
  });

  it('rejects wrong confirmation', () => {
    const result = deleteAccountSchema.safeParse({ confirmation: 'delete' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = deleteAccountSchema.safeParse({ confirmation: '' });
    expect(result.success).toBe(false);
  });
});

describe('Update Profile Schema', () => {
  it('accepts valid update', () => {
    const result = updateProfileSchema.safeParse({
      fullName: 'New Name',
      bio: 'Hello world',
      username: 'valid-user',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty string for optional fields', () => {
    const result = updateProfileSchema.safeParse({
      fullName: '',
      bio: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short username', () => {
    const result = updateProfileSchema.safeParse({ username: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects username with spaces', () => {
    const result = updateProfileSchema.safeParse({ username: 'user name' });
    expect(result.success).toBe(false);
  });

  it('accepts username with hyphens and underscores', () => {
    const result = updateProfileSchema.safeParse({ username: 'my-user_name' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = updateProfileSchema.safeParse({ website: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts valid URL', () => {
    const result = updateProfileSchema.safeParse({ website: 'https://example.com' });
    expect(result.success).toBe(true);
  });
});

describe('Forgot Password Schema', () => {
  it('accepts valid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('Reset Password Schema', () => {
  it('accepts valid reset', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'NewPass1!',
      confirmPassword: 'NewPass1!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched confirm', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'NewPass1!',
      confirmPassword: 'Different1!',
    });
    expect(result.success).toBe(false);
  });
});
