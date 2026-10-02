import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { albums, albumImages } from '../../../src/server/collections/schema.ts';
import { mediaImages } from '../../../src/server/media/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('handles real owner-cookie batch HTTP, origin checks, mixed outcomes and read-only recovery after a lost response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-batch-http-'));
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
    const post = (
      body: unknown,
      headers: Record<string, string> = { cookie, origin },
    ) =>
      fetch(`${origin}/api/images/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const request = {
      ids: ['real', 'missing'],
      query: '',
      command: { type: 'visibility', visibility: 'private' },
      mode: 'apply',
    };
    for (const mode of ['apply', 'check']) {
      for (const headers of [
        { origin },
        { origin, authorization: `Bearer ${token}` },
        { origin, cookie: `ariso.share_token=${token}` },
      ] as Record<string, string>[]) {
        const response = await post({ ...request, mode }, headers);
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      for (const headers of [
        { cookie, origin: 'https://wrong.example' },
        { cookie },
      ] as Record<string, string>[]) {
        const response = await post({ ...request, mode }, headers);
        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      }
    }
    live.db
      .insert(storageConfigs)
      .values({
        id: 'local',
        name: 'Local',
        type: 'local',
        localPath: join(data, 'images'),
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    for (const [id, visibility] of [
      ['real', 'public'],
      ['same', 'private'],
    ] as const)
      live.db
        .insert(mediaImages)
        .values({
          id,
          storageId: 'local',
          originalName: `${id}.png`,
          displayName: id,
          visibility,
          format: 'PNG',
          mime: 'image/png',
          byteSize: 100,
          processingStatus: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
    const response = await post({
      ...request,
      ids: ['real', 'same', 'missing'],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      results: [
        { id: 'real', status: 'changed', inQuery: true },
        { id: 'same', status: 'unchanged', inQuery: true },
        {
          id: 'missing',
          status: 'failed',
          code: 'MEDIA_IMAGE_NOT_FOUND',
          inQuery: false,
        },
      ],
    });
    live.db
      .insert(albums)
      .values({
        id: 'album',
        name: 'Album',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    const added = await post({
      ...request,
      ids: ['real'],
      command: { type: 'add-albums', albumIds: ['album'] },
    });
    expect(added.status).toBe(200);
    const originalJoin = live.db.select().from(albumImages).get();
    // Intentionally discard the returned mutation result, then reconcile through check.
    expect(
      (
        await post({
          ...request,
          ids: ['real'],
          query: 'visibility=private',
          command: { type: 'trash' },
        })
      ).status,
    ).toBe(200);
    const checked = await post({
      ...request,
      ids: ['real'],
      query: 'visibility=private',
      command: { type: 'trash' },
      mode: 'check',
    });
    expect(await checked.json()).toMatchObject({
      results: [
        {
          id: 'real',
          status: 'unchanged',
          inQuery: false,
          message: '核对成功，当前已是目标状态',
        },
      ],
    });
    const selection = await fetch(`${origin}/api/images/selection`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['real', 'same'], query: 'scope=trash' }),
    });
    expect(await selection.json()).toMatchObject({
      items: [{ id: 'real', thumbnailUrl: null, storage: { enabled: false } }],
    });
    const restored = await post({
      ...request,
      ids: ['real'],
      query: 'scope=trash',
      command: { type: 'restore' },
    });
    expect(await restored.json()).toMatchObject({
      results: [{ id: 'real', status: 'changed', inQuery: false }],
    });
    expect(live.db.select().from(albumImages).get()).toEqual(originalJoin);
    expect(
      live.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, 'real'))
        .get(),
    ).toMatchObject({ id: 'real', visibility: 'private', trashedAt: null });
    const before = live.db.select().from(mediaImages).all();
    for (const body of [
      { ...request, ids: [] },
      { ...request, ids: Array.from({ length: 201 }, (_, i) => `id-${i}`) },
      { ...request, query: 'page=1' },
      { ...request, mode: undefined },
      { ...request, command: { type: 'remove-tags', tagIds: [] } },
      { ...request, allMatching: true },
    ]) {
      const invalid = await post(body);
      expect(invalid.status).toBe(400);
      expect(invalid.headers.get('cache-control')).toBe('no-store');
      expect(await invalid.json()).toMatchObject({
        code: 'LIBRARY_INVALID_BATCH',
      });
    }
    const malformed = await fetch(`${origin}/api/images/batch`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get('cache-control')).toBe('no-store');
    expect(live.db.select().from(mediaImages).all()).toEqual(before);
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
