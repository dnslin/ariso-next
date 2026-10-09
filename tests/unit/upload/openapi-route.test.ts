import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  site: null as { publicUrl: string; secret?: string; name?: string } | null,
  db: {},
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => ({ connection: { db: state.db } }),
}));
vi.mock('../../../src/server/site/settings.ts', () => ({
  readSiteSettings: vi.fn(() => state.site),
}));
import { GET } from '../../../src/app/api/openapi.json/route.ts';

beforeEach(() => {
  state.site = null;
});

it('returns a clear uninitialized response instead of inventing a site URL', async () => {
  const response = GET();
  expect(response.status).toBe(409);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    code: 'SITE_NOT_INITIALIZED',
    message: '站点尚未初始化',
  });
});

it('serves the current site contract without authentication or management fields', async () => {
  state.site = {
    publicUrl: 'https://first.example.test',
    name: 'private owner label',
    secret: 'must-not-leak',
  };
  const first = GET();
  expect(first.status).toBe(200);
  expect(first.headers.get('cache-control')).toBe('no-store');
  expect(first.headers.get('content-type')).toContain('application/json');
  const body = await first.json();
  expect(body.servers[0].url).toBe('https://first.example.test');
  expect(JSON.stringify(body)).not.toContain('must-not-leak');
  expect(JSON.stringify(body)).not.toContain('private owner label');
  state.site.publicUrl = 'https://changed.example.test';
  expect((await GET().json()).servers[0].url).toBe(
    'https://changed.example.test',
  );
});
