import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import {
  mediaImages,
  mediaObjects,
  mediaSettings,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('generates real copy lines only for owner-cookie same-origin requests, preserving per-item failure and no-store errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-copy-http-'));
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
    const input = {
      ids: ['real', 'missing'],
      query: '',
      version: 'default',
      format: 'url',
    };
    const url = `${origin}/api/images/copy`;
    const post = (
      body: unknown = input,
      headers: Record<string, string> = { cookie, origin },
    ) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    for (const headers of [
      { origin },
      { origin, authorization: `Bearer ${token}` },
      { origin, cookie: `ariso.share_token=${token}` },
    ] as Record<string, string>[]) {
      const response = await post(input, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    const foreign = await post(input, {
      cookie,
      origin: 'https://foreign.test',
    });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
    const now = new Date(1000);
    live.db
      .insert(storageConfigs)
      .values({
        id: 'copy-local',
        name: 'Copy Local',
        type: 'local',
        localPath: join(data, 'no-content'),
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    live.db
      .insert(mediaImages)
      .values({
        id: 'real',
        storageId: 'copy-local',
        originalName: 'real.png',
        displayName: '真实名称',
        visibility: 'private',
        classification: 'static',
        format: 'PNG',
        mime: 'image/png',
        byteSize: 100,
        processingStatus: 'failed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    live.db
      .insert(mediaObjects)
      .values({
        id: 'real-original',
        imageId: 'real',
        storageId: 'copy-local',
        key: 'missing-physical-file.png',
        purpose: 'original',
        status: 'stored',
        byteSize: 100,
        format: 'PNG',
        mime: 'image/png',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    live.db
      .insert(mediaVersions)
      .values({
        imageId: 'real',
        kind: 'original',
        objectId: 'real-original',
        byteSize: 100,
        format: 'PNG',
        mime: 'image/png',
        createdAt: now,
      })
      .run();
    live.db.update(mediaSettings).set({ defaultLinkVersion: 'original' }).run();
    const result = await post();
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({
      sort: 'uploaded_desc',
      items: [
        {
          imageId: 'real',
          displayName: '真实名称',
          sortKey: { value: 1000, id: 'real' },
          actualVersion: 'original',
          line: `${origin}/i/real`,
          accessWarning: '此链接仅所有者登录后可访问，外部访客无权访问',
          originalDisclosure: false,
        },
      ],
      unavailable: [
        {
          imageId: 'missing',
          displayName: 'missing',
          reason: '图片不存在',
          actualVersion: null,
        },
      ],
    });
    live.db
      .update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, 'copy-local'))
      .run();
    const disabled = await post();
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({
      items: [],
      unavailable: [
        { imageId: 'missing' },
        { imageId: 'real', reason: '图片所属存储已停用' },
      ],
    });
    for (const body of [
      { ...input, ids: [] },
      { ...input, ids: Array.from({ length: 201 }, () => 'real') },
      { ...input, query: 'page=1' },
      { ...input, version: 'unknown' },
      { ...input, format: 'javascript' },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        code: 'LIBRARY_INVALID_QUERY',
      });
    }
    const stale = await post({ ...input, query: 'tagId=removed' });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'LIBRARY_STALE_REFERENCE',
    });
    const malformed = await fetch(url, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      code: 'LIBRARY_INVALID_QUERY',
    });
    // Revoked sessions must not keep exposing the owner's selected links.
    const logout = await fetch(`${origin}/api/auth/sign-out`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(logout.status).toBe(200);
    expect((await post()).status).toBe(401);
    expect(
      live.db.$client.prepare('select * from analytics_daily').all(),
    ).toEqual([]);
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
