import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
const state = vi.hoisted(() => ({
  authorized: true,
  runtime: {} as Record<string, unknown>,
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => state.runtime,
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwnerSession: async () => {
    if (!state.authorized)
      throw Object.assign(new Error('请先登录'), {
        code: 'UNAUTHORIZED',
        status: 401,
      });
    return {
      user: { id: 'owner', email: 'owner@example.test' },
      session: { id: 'session' },
    };
  },
}));
const routes = [
  {
    path: 'account/email',
    method: 'PATCH',
    load: () => import('../../../src/app/api/account/email/route.ts'),
  },
  {
    path: 'account/password',
    method: 'POST',
    load: () => import('../../../src/app/api/account/password/route.ts'),
  },
  {
    path: 'account/github',
    method: 'DELETE',
    load: () => import('../../../src/app/api/account/github/route.ts'),
  },
  {
    path: 'account/github/link',
    method: 'POST',
    load: () => import('../../../src/app/api/account/github/link/route.ts'),
  },
  {
    path: 'upload-tokens',
    method: 'POST',
    load: () => import('../../../src/app/api/upload-tokens/route.ts'),
  },
  {
    path: 'upload-tokens/id',
    method: 'PATCH',
    load: () => import('../../../src/app/api/upload-tokens/[id]/route.ts'),
  },
  {
    path: 'upload-tokens/id',
    method: 'DELETE',
    load: () => import('../../../src/app/api/upload-tokens/[id]/route.ts'),
  },
  {
    path: 'settings/github',
    method: 'PATCH',
    load: () => import('../../../src/app/api/settings/github/route.ts'),
  },
  {
    path: 'settings/smtp',
    method: 'PATCH',
    load: () => import('../../../src/app/api/settings/smtp/route.ts'),
  },
  {
    path: 'settings/smtp/test',
    method: 'POST',
    load: () => import('../../../src/app/api/settings/smtp/test/route.ts'),
  },
] as const;
beforeEach(() => {
  const contentMutations = createContentMutations();
  contentMutations.closeAdmission();
  state.authorized = true;
  state.runtime = {
    contentMutations,
    config: { logLevel: 'silent' },
    connection: { db: { $client: { name: 'isolated-test' } } },
  };
});
describe('identity writes while a backup pauses mutations', () => {
  for (const route of routes) {
    it(`${route.method} ${route.path} rejects before body parsing and library writes`, async () => {
      const request = new Request(`http://localhost/api/${route.path}`, {
        method: route.method,
        body: '{',
      });
      const json = vi.spyOn(request, 'json');
      const text = vi.spyOn(request, 'text');
      const handler = ((await route.load()) as Record<string, unknown>)[
        route.method
      ] as (
        request: Request,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>;
      const response = await handler(request, {
        params: Promise.resolve({ id: 'fixture-id' }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'SITE_BACKUP_IN_PROGRESS',
      });
      expect(request.bodyUsed).toBe(false);
      expect(json).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
    });
    it(`${route.method} ${route.path} keeps owner authentication first`, async () => {
      state.authorized = false;
      const handler = ((await route.load()) as Record<string, unknown>)[
        route.method
      ] as (
        request: Request,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>;
      const response = await handler(
        new Request(`http://localhost/api/${route.path}`, {
          method: route.method,
        }),
        { params: Promise.resolve({ id: 'fixture-id' }) },
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }
});
