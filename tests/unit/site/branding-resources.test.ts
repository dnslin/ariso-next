import { existsSync, statfsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createMediaResources } from '../../../src/server/media/resources.ts';
import { writeBrandingResponse } from '../../../src/server/site/branding-http.ts';

const state = vi.hoisted(() => ({ runtime: {} as Record<string, unknown> }));

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, statfsSync: vi.fn(fs.statfsSync) };
});
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => state.runtime,
}));
vi.mock('../../../src/server/site/settings-http.ts', () => ({
  siteSettingsResponse: (
    _request: Request,
    operation: (db: undefined) => unknown,
  ) => operation(undefined),
}));

it('品牌 multipart 接收保留同盘已受理上传的剩余写入空间', async () => {
  const MiB = 1024 * 1024;
  const root = await mkdtemp(join(tmpdir(), 'ariso-branding-resources-'));
  const source = join(root, 'source');
  try {
    vi.mocked(statfsSync).mockImplementation(
      () =>
        ({
          bavail: 300 * MiB - (existsSync(source) ? statSync(source).size : 0),
          bsize: 1,
        }) as ReturnType<typeof statfsSync>,
    );
    const resources = createMediaResources();
    resources.reserveWrite('ongoing-upload', root, 40 * MiB);
    state.runtime = {
      mediaResources: resources,
      branding: {
        async replace(
          _kind: string,
          receive: (path: string, signal: AbortSignal) => Promise<unknown>,
          signal: AbortSignal,
        ) {
          await receive(source, signal);
          return { key: 'site-logo-test.png', mime: 'image/png' };
        },
      },
    };
    const body = new FormData();
    body.append('file', new Blob([Buffer.alloc(5 * MiB)]), 'brand.png');
    const request = new Request(
      'http://example.test/api/settings/site/branding/logo',
      {
        method: 'PUT',
        body,
      },
    );

    await expect(writeBrandingResponse(request, 'logo')).rejects.toMatchObject({
      code: 'UPLOAD_INSUFFICIENT_SPACE',
      status: 507,
      cause: { code: 'INSUFFICIENT_DISK_SPACE' },
    });
    expect(statSync(source).size).toBeLessThanOrEqual(4 * MiB);
    expect(() =>
      resources.reserveWrite('ongoing-upload', root, 40 * MiB),
    ).not.toThrow();
    expect(() =>
      resources.reserveWrite('another-write', root, 5 * MiB),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_DISK_SPACE' }));
  } finally {
    vi.restoreAllMocks();
    state.runtime = {};
    await rm(root, { recursive: true, force: true });
  }
});
