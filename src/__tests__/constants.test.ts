import { describe, it, expect } from 'vitest';
import { ROUTES, PAGINATION, HTTP_STATUS } from '@/config/constants';

describe('Route Constants', () => {
  it('has all required routes', () => {
    expect(ROUTES.HOME).toBe('/');
    expect(ROUTES.LOGIN).toBeDefined();
    expect(ROUTES.SIGNUP).toBeDefined();
    expect(ROUTES.DASHBOARD).toBeDefined();
    expect(ROUTES.CHAT).toBeDefined();
    expect(ROUTES.CONTENT).toBeDefined();
    expect(ROUTES.IMAGE).toBeDefined();
  });

  it('routes start with /', () => {
    const routeKeys = Object.keys(ROUTES) as Array<keyof typeof ROUTES>;
    for (const key of routeKeys) {
      expect(ROUTES[key]).toMatch(/^\//);
    }
  });
});

describe('Pagination Constants', () => {
  it('has sensible defaults', () => {
    expect(PAGINATION.DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
    expect(PAGINATION.MAX_PAGE_SIZE).toBeGreaterThanOrEqual(PAGINATION.DEFAULT_PAGE_SIZE);
  });
});

describe('HTTP Status Constants', () => {
  it('has standard status codes', () => {
    expect(HTTP_STATUS.OK).toBe(200);
    expect(HTTP_STATUS.CREATED).toBe(201);
    expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
    expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
    expect(HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(HTTP_STATUS.INTERNAL_ERROR).toBe(500);
  });
});
