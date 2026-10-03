import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { mediaImages } from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('rechecks real selected records through owner-cookie HTTP with explicit validation and no caching', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-selection-http-'));
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
    live = openRuntimeDatabase(join(data, 'ariso.db'));
    await seedAuthOwner(live, origin);
    const login = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const token = (await login.json()).token;
    const url = `${origin}/api/images/selection`;
    const post = (
      body: unknown,
      headers: Record<string, string> = { cookie, origin },
    ) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const unauthorizedHeaders: Record<string, string>[] = [
      { origin },
      { origin, authorization: `Bearer ${token}` },
      { origin, cookie: `ariso.share_token=${token}` },
    ];
    for (const headers of unauthorizedHeaders) {
      const response = await post({ ids: ['real'], query: '' }, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    const wrongOrigin = await post(
      { ids: ['real'], query: '' },
      { cookie, origin: 'https://wrong.example' },
    );
    expect(wrongOrigin.status).toBe(403);
    expect(await wrongOrigin.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
    expect(wrongOrigin.headers.get('cache-control')).toBe('no-store');
    live.db
      .insert(storageConfigs)
      .values({
        id: 'local',
        name: 'Local',
        type: 'local',
        localPath: join(data, 'images'),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    for (const id of ['real', 'other'])
      live.db
        .insert(mediaImages)
        .values({
          id,
          storageId: 'local',
          originalName: `${id}.png`,
          displayName: id,
          visibility: 'private',
          format: 'PNG',
          mime: 'image/png',
          byteSize: 100,
          processingStatus: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
    const response = await post({
      ids: ['real', 'missing'],
      query: 'visibility=private',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      items: [
        {
          id: 'real',
          displayName: 'real',
          byteSize: 100,
          processingStatus: 'ready',
          storage: { id: 'local', name: 'Local', enabled: true },
          thumbnailUrl: null,
        },
      ],
    });
    live.db
      .update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, 'real'))
      .run();
    expect(await (await post({ ids: ['real'], query: '' })).json()).toEqual({
      items: [],
    });
    const stale = await post({ ids: ['other'], query: 'albumId=removed' });
    expect(stale.status).toBe(409);
    expect(stale.headers.get('cache-control')).toBe('no-store');
    expect(await stale.json()).toMatchObject({
      code: 'LIBRARY_STALE_REFERENCE',
    });
    for (const body of [
      { ids: [], query: '' },
      { ids: Array.from({ length: 201 }, (_, i) => `id-${i}`), query: '' },
      { ids: ['other'], query: 'page=1' },
      { ids: ['other'], query: '', extra: true },
    ]) {
      const invalid = await post(body);
      expect(invalid.status).toBe(400);
      expect(invalid.headers.get('cache-control')).toBe('no-store');
      expect(await invalid.json()).toMatchObject({
        code: 'LIBRARY_INVALID_QUERY',
      });
    }
    const malformed = await fetch(url, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      code: 'LIBRARY_INVALID_QUERY',
    });
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
