import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';

const runtime = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  authorized: true,
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => runtime.current,
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: async () => {
    if (!runtime.authorized)
      throw Object.assign(new Error('请先登录'), {
        code: 'UNAUTHORIZED',
        status: 401,
      });
    return { user: { id: 'owner' }, session: { id: 'session' } };
  },
}));

type Route = {
  path: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  load: () => Promise<Record<string, unknown>>;
};
const routes: Route[] = [
  {
    path: 'albums',
    method: 'POST',
    load: () => import('../../../src/app/api/albums/route.ts'),
  },
  {
    path: 'albums/id',
    method: 'PATCH',
    load: () => import('../../../src/app/api/albums/[id]/route.ts'),
  },
  {
    path: 'albums/id',
    method: 'DELETE',
    load: () => import('../../../src/app/api/albums/[id]/route.ts'),
  },
  {
    path: 'albums/id/cover',
    method: 'PUT',
    load: () => import('../../../src/app/api/albums/[id]/cover/route.ts'),
  },
  {
    path: 'albums/id/share',
    method: 'POST',
    load: () => import('../../../src/app/api/albums/[id]/share/route.ts'),
  },
  {
    path: 'albums/id/share',
    method: 'PATCH',
    load: () => import('../../../src/app/api/albums/[id]/share/route.ts'),
  },
  {
    path: 'albums/id/share/rotate',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/albums/[id]/share/rotate/route.ts'),
  },
  {
    path: 'tags',
    method: 'POST',
    load: () => import('../../../src/app/api/tags/route.ts'),
  },
  {
    path: 'tags/id',
    method: 'PATCH',
    load: () => import('../../../src/app/api/tags/[id]/route.ts'),
  },
  {
    path: 'tags/id',
    method: 'DELETE',
    load: () => import('../../../src/app/api/tags/[id]/route.ts'),
  },
  {
    path: 'images/id',
    method: 'PATCH',
    load: () => import('../../../src/app/api/images/[id]/route.ts'),
  },
  {
    path: 'images/id',
    method: 'DELETE',
    load: () => import('../../../src/app/api/images/[id]/route.ts'),
  },
  {
    path: 'images/id/collections',
    method: 'PATCH',
    load: () => import('../../../src/app/api/images/[id]/collections/route.ts'),
  },
  {
    path: 'images/id/metadata/read',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/images/[id]/metadata/read/route.ts'),
  },
  {
    path: 'images/id/reprocess',
    method: 'POST',
    load: () => import('../../../src/app/api/images/[id]/reprocess/route.ts'),
  },
  {
    path: 'images/id/replace',
    method: 'POST',
    load: () => import('../../../src/app/api/images/[id]/replace/route.ts'),
  },
  {
    path: 'images/id/sizes',
    method: 'POST',
    load: () => import('../../../src/app/api/images/[id]/sizes/route.ts'),
  },
  {
    path: 'images/id/trash',
    method: 'POST',
    load: () => import('../../../src/app/api/images/[id]/trash/route.ts'),
  },
  {
    path: 'images/id/restore',
    method: 'POST',
    load: () => import('../../../src/app/api/images/[id]/restore/route.ts'),
  },
  {
    path: 'images/id/cleanup/retry',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/images/[id]/cleanup/retry/route.ts'),
  },
  {
    path: 'images/id/share',
    method: 'POST',
    load: () => import('../../../src/app/api/images/[id]/share/route.ts'),
  },
  {
    path: 'images/id/share',
    method: 'DELETE',
    load: () => import('../../../src/app/api/images/[id]/share/route.ts'),
  },
  {
    path: 'images/batch',
    method: 'POST',
    load: () => import('../../../src/app/api/images/batch/route.ts'),
  },
  {
    path: 'media/watermark-assets',
    method: 'POST',
    load: () => import('../../../src/app/api/media/watermark-assets/route.ts'),
  },
  {
    path: 'settings/media',
    method: 'PATCH',
    load: () => import('../../../src/app/api/settings/media/route.ts'),
  },
  {
    path: 'settings/site',
    method: 'PATCH',
    load: () => import('../../../src/app/api/settings/site/route.ts'),
  },
  {
    path: 'settings/upload',
    method: 'PATCH',
    load: () => import('../../../src/app/api/settings/upload/route.ts'),
  },
  {
    path: 'settings/storage',
    method: 'PATCH',
    load: () => import('../../../src/app/api/settings/storage/route.ts'),
  },
  {
    path: 'settings/site/branding/[kind]',
    method: 'PUT',
    load: () =>
      import('../../../src/app/api/settings/site/branding/[kind]/route.ts'),
  },
  {
    path: 'settings/site/branding/[kind]',
    method: 'DELETE',
    load: () =>
      import('../../../src/app/api/settings/site/branding/[kind]/route.ts'),
  },
  {
    path: 'storages',
    method: 'POST',
    load: () => import('../../../src/app/api/storages/route.ts'),
  },
  {
    path: 'storages/[id]',
    method: 'PATCH',
    load: () => import('../../../src/app/api/storages/[id]/route.ts'),
  },
  {
    path: 'storages/[id]',
    method: 'DELETE',
    load: () => import('../../../src/app/api/storages/[id]/route.ts'),
  },
  {
    path: 'storages/[id]/scan',
    method: 'POST',
    load: () => import('../../../src/app/api/storages/[id]/scan/route.ts'),
  },
  {
    path: 'storages/[id]/test',
    method: 'POST',
    load: () => import('../../../src/app/api/storages/[id]/test/route.ts'),
  },
  {
    path: 'storages/[id]/cors-tests',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/storages/[id]/cors-tests/route.ts'),
  },
  {
    path: 'storages/[id]/cors-tests/[probeId]/complete',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/storages/[id]/cors-tests/[probeId]/complete/route.ts'),
  },
  {
    path: 'storages/[id]/probes/[probeId]/retry-cleanup',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/storages/[id]/probes/[probeId]/retry-cleanup/route.ts'),
  },
  {
    path: 'uploads/submissions',
    method: 'POST',
    load: () => import('../../../src/app/api/uploads/submissions/route.ts'),
  },
  {
    path: 'uploads/sessions/[id]/begin',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/uploads/sessions/[id]/begin/route.ts'),
  },
  {
    path: 'uploads/sessions/[id]/content',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/uploads/sessions/[id]/content/route.ts'),
  },
  {
    path: 'uploads/sessions/[id]/complete',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/uploads/sessions/[id]/complete/route.ts'),
  },
  {
    path: 'uploads/sessions/[id]/resubmit',
    method: 'POST',
    load: () =>
      import('../../../src/app/api/uploads/sessions/[id]/resubmit/route.ts'),
  },
  {
    path: 'uploads/sessions/[id]',
    method: 'DELETE',
    load: () => import('../../../src/app/api/uploads/sessions/[id]/route.ts'),
  },
  {
    path: 'uploads/cleanup',
    method: 'POST',
    load: () => import('../../../src/app/api/uploads/cleanup/route.ts'),
  },
];

beforeEach(() => {
  const contentMutations = createContentMutations();
  contentMutations.closeAdmission();
  runtime.authorized = true;
  runtime.current = {
    contentMutations,
    config: { logLevel: 'silent' },
    connection: { db: {} },
  };
});

describe('explicit content mutation routes during backup', () => {
  for (const route of routes) {
    it(`${route.method} ${route.path} rejects before parsing input or changing data`, async () => {
      const request = new Request(`http://localhost/api/${route.path}`, {
        method: route.method,
        body: '{',
      });
      const json = vi.spyOn(request, 'json');
      const bodyText = vi.spyOn(request, 'text');
      const handler = (await route.load())[route.method] as (
        request: Request,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>;
      const response = await handler(request, {
        params: Promise.resolve({ id: 'd33430d6-6a78-4fe8-ae02-9d7cd7c5682a' }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'SITE_BACKUP_IN_PROGRESS',
      });
      expect(json).not.toHaveBeenCalled();
      expect(bodyText).not.toHaveBeenCalled();
      expect(request.bodyUsed).toBe(false);
    });

    it(`${route.method} ${route.path} keeps authentication before the pause result`, async () => {
      runtime.authorized = false;
      const request = new Request(`http://localhost/api/${route.path}`, {
        method: route.method,
      });
      const handler = (await route.load())[route.method] as (
        request: Request,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>;
      const response = await handler(request, {
        params: Promise.resolve({ id: 'd33430d6-6a78-4fe8-ae02-9d7cd7c5682a' }),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }
});
