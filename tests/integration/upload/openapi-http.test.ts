import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { createUploadOpenApiDocument } from '../../../src/server/upload/openapi.ts';
import { seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('serves an unauthenticated live contract and follows the saved public address without publishing owner data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-upload-openapi-http-'));
  const data = join(directory, 'data');
  const server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: data,
    HOST: '127.0.0.1',
  });
  let live: ReturnType<typeof openRuntimeDatabase> | undefined;
  try {
    const origin = `http://127.0.0.1:${server.port}`;
    await vi.waitFor(
      async () => {
        if (server.child.exitCode !== null) throw new Error(server.logs());
        expect((await fetch(`${origin}/api/health`)).status).toBe(200);
      },
      { timeout: 15000 },
    );
    const url = `${origin}/api/openapi.json`;
    const uninitialized = await fetch(url);
    expect(uninitialized.status).toBe(409);
    expect(uninitialized.headers.get('cache-control')).toBe('no-store');
    expect(await uninitialized.json()).toEqual({
      code: 'SITE_NOT_INITIALIZED',
      message: '站点尚未初始化',
    });
    live = openRuntimeDatabase(join(data, 'ariso.db'));
    await seedAuthOwner(live, origin);
    const first = await fetch(url);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('content-type')).toContain('application/json');
    expect(await first.json()).toEqual(createUploadOpenApiDocument(origin));
    live.db
      .update(siteSettings)
      .set({
        publicUrl: 'https://public-address.example.test',
        name: 'private-owner-name',
        description: 'private-owner-description',
      })
      .where(eq(siteSettings.id, 1))
      .run();
    const changed = await fetch(url);
    expect(changed.status).toBe(200);
    const text = await changed.text();
    expect(text).not.toContain('private-owner-name');
    expect(text).not.toContain('private-owner-description');
    expect(JSON.parse(text).servers).toEqual([
      {
        url: 'https://public-address.example.test',
        description: '当前站点公开地址',
      },
    ]);
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
