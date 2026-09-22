import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { requireMediaSettings } from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { requireSiteSettings } from '../../../src/server/site/settings.ts';
import { resolveUploadStorage } from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  readObject,
  writeObject,
} from '../../../src/server/storage/local.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('M1: empty directory → setup → login → logout → real restart preserves owner, settings and default storage bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-m1-'));
  const data = join(directory, 'data');
  const env = {
    DATA_DIR: data,
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  try {
    await expect(stat(data)).rejects.toMatchObject({ code: 'ENOENT' });
    server = await launch(resolve('.next/standalone'), directory, env);
    const origin = `http://127.0.0.1:${server.port}`;
    const request = (path: string, init: RequestInit = {}) =>
      fetch(`${origin}${path}`, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    const post = (path: string, body: object, cookie = '') =>
      request(path, {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const health = async () => {
      await vi.waitFor(
        async () => {
          expect(server!.child.exitCode, server!.logs()).toBeNull();
          const response = await request('/api/health');
          expect(response.status).toBe(200);
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(await response.json()).toEqual({ status: 'ok' });
        },
        { timeout: 15000 },
      );
    };
    await health();
    const codes = server
      .logs()
      .split('\n')
      .flatMap((line) => {
        if (!line.startsWith('{')) return [];
        const record = JSON.parse(line);
        return record.event === 'setup-code' ? [record.code as string] : [];
      });
    expect(codes).toHaveLength(1);
    connection = openRuntimeDatabase(join(data, 'ariso.db'));
    const db = connection.db;
    const storage = resolveUploadStorage(db);
    expect(storage).toMatchObject({
      name: '默认本地存储',
      type: 'local',
      enabled: true,
      localPath: 'default',
    });
    expect(
      (await stat(join(data, 'storage', storage.localPath))).isDirectory(),
    ).toBe(true);
    const credentials = {
      email: 'm1-owner@example.test',
      password: randomBytes(24).toString('hex'),
    };
    const payload = {
      ...credentials,
      code: codes[0],
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    };
    const setup = await post('/api/setup', payload);
    expect(setup.status).toBe(200);
    expect(setup.headers.getSetCookie()).toEqual([]);
    expect(await setup.json()).toEqual({
      code: 'SETUP_COMPLETED',
      redirectTo: '/login',
    });
    const site = requireSiteSettings(db);
    const media = requireMediaSettings(db);
    expect(site).toMatchObject({
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    });
    expect(media).toEqual({
      id: 1,
      compressionEnabled: true,
      outputFormat: 'webp',
      quality: 82,
      maxEdge: null,
      jpegBackground: '#FFFFFF',
      watermarkMode: 'off',
      defaultLinkVersion: 'compressed',
      defaultVisibility: 'public',
      concurrency: 1,
      updatedAt: expect.any(Date),
    });
    // Exercise the default provider's real object API; this is not an upload UI claim.
    const bytes = randomBytes(65536);
    const write = planLocalWrite('m1/persistence');
    await writeObject(
      join(data, 'storage'),
      storage,
      write,
      Readable.from([bytes]),
    );
    const owner = db.$client.prepare('SELECT id, email FROM user').get();
    const login = async () => {
      const response = await post('/api/auth/sign-in/email', credentials);
      expect(response.status, await response.clone().text()).toBe(200);
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect(cookie).toContain('session_token=');
      const session = await request('/api/auth/get-session', {
        headers: { cookie },
      });
      expect((await session.json()).user).toMatchObject(owner!);
      expect((await request('/admin', { headers: { cookie } })).status).toBe(
        200,
      );
      return cookie;
    };
    const logout = async (cookie: string) => {
      expect((await post('/api/auth/sign-out', {}, cookie)).status).toBe(200);
      expect(
        await (
          await request('/api/auth/get-session', { headers: { cookie } })
        ).json(),
      ).toBeNull();
      const anonymous = await request('/admin', { headers: { cookie } });
      expect(anonymous.status).toBe(307);
      expect(anonymous.headers.get('location')).toContain('/login');
    };
    const revokedCookie = await login();
    await logout(revokedCookie);
    await health();
    const previousPid = server.child.pid;
    await stop(server.child, server.closed);
    connection.close();
    connection = undefined;
    server = await launch(resolve('.next/standalone'), directory, {
      ...env,
      PORT: String(server.port),
    });
    await health();
    expect(server.child.pid).not.toBe(previousPid);
    expect(server.logs()).not.toContain('setup-code');
    connection = openRuntimeDatabase(join(data, 'ariso.db'));
    const restarted = connection.db;
    expect(requireSiteSettings(restarted)).toEqual(site);
    expect(requireMediaSettings(restarted)).toEqual(media);
    expect(resolveUploadStorage(restarted)).toEqual(storage);
    const object = await readObject(
      join(data, 'storage'),
      resolveUploadStorage(restarted),
      write.key,
      'application/octet-stream',
    );
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
    expect(object.size).toBe(bytes.length);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    const secondOwner = await post('/api/setup', {
      ...payload,
      email: 'second-owner@example.test',
    });
    expect(secondOwner.status).toBe(409);
    expect(await secondOwner.json()).toMatchObject({
      code: 'SETUP_ALREADY_COMPLETED',
    });
    expect(
      restarted.$client.prepare('SELECT id, email FROM user').all(),
    ).toEqual([owner]);
    expect(
      await (
        await request('/api/auth/get-session', {
          headers: { cookie: revokedCookie },
        })
      ).json(),
    ).toBeNull();
    await logout(await login());
    await health();
  } finally {
    if (server) await stop(server.child, server.closed);
    connection?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
