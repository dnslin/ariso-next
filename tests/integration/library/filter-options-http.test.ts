import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { tags } from '../../../src/server/collections/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('requires owner cookies and returns real filter options and explicit bad-query errors without caching', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-filter-options-http-'));
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
    const url = `${origin}/api/images/filter-options`;
    for (const headers of [
      {},
      { authorization: `Bearer ${token}` },
      { cookie: `ariso.share_token=${token}` },
    ] as Record<string, string>[]) {
      const response = await fetch(`${url}?kind=tags`, { headers });
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    live.db
      .insert(tags)
      .values({
        id: 'real-tag',
        displayName: '旅行',
        normalizedKey: '旅行',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    const response = await fetch(`${url}?kind=tags&selectedId=missing`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      items: [{ id: 'real-tag', name: '旅行' }],
      selected: [],
      missingIds: ['missing'],
      page: 1,
      hasMore: false,
    });
    for (const query of [
      'kind=tags&page=0',
      'kind=tags&kind=albums',
      'kind=unknown',
    ]) {
      const invalid = await fetch(`${url}?${query}`, { headers: { cookie } });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        code: 'LIBRARY_INVALID_QUERY',
      });
    }
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
