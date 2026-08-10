import { describe, it, expect } from 'vitest';
import { AppError, Errors, isAppError } from '@/services/errors';

describe('AppError', () => {
  it('stores status code and message', () => {
    const err = new AppError('Bad request', 400);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad request');
    expect(err).toBeInstanceOf(AppError);
  });

  it('is an instance of Error', () => {
    const err = new AppError('Server error', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('isAppError', () => {
  it('returns true for AppError instances', () => {
    expect(isAppError(new AppError('test', 400))).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isAppError(new Error('test'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isAppError('string')).toBe(false);
    expect(isAppError(42)).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe('Errors factory', () => {
  it('badRequest creates 400 error', () => {
    const err = Errors.badRequest('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid input');
  });

  it('unauthorized creates 401 error', () => {
    const err = Errors.unauthorized('Not logged in');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Not logged in');
  });

  it('forbidden creates 403 error', () => {
    const err = Errors.forbidden('No access');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('No access');
  });

  it('notFound creates 404 error', () => {
    const err = Errors.notFound('Resource missing');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Resource missing');
  });

  it('internal creates 500 error', () => {
    const err = Errors.internal('Something broke');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Something broke');
  });

  it('all factory results pass isAppError check', () => {
    const factories = [
      () => Errors.badRequest(''),
      () => Errors.unauthorized(''),
      () => Errors.forbidden(''),
      () => Errors.notFound(''),
      () => Errors.internal(''),
    ];
    for (const factory of factories) {
      expect(isAppError(factory())).toBe(true);
    }
  });
});
