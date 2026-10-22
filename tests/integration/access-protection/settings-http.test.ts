import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

async function withServer(
  trustedProxies: string | undefined,
  run: (context: {
    origin: string;
    cookie: string;
    token: string;
    connection: ReturnType<typeof openRuntimeDatabase>;
  }) => Promise<void>,
) {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-access-settings-http-'));
  const data = join(directory, 'data');
  const server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: data,
    HOST: '127.0.0.1',
    ARISO_TRUSTED_PROXIES: trustedProxies,
  });
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  try {
    const origin = `http://127.0.0.1:${server.port}`;
    await vi.waitFor(
      async () => {
        expect(server.child.exitCode, server.logs()).toBeNull();
        expect((await fetch(`${origin}/api/health`)).status).toBe(200);
      },
      { timeout: 15000 },
    );
    connection = openRuntimeDatabase(join(data, 'ariso.db'));
    await seedAuthOwner(connection, origin);
    const login = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status, await login.clone().text()).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    await run({
      origin,
      cookie,
      token: (await login.json()).token,
      connection,
    });
  } finally {
    try {
      await stop(server.child, server.closed);
    } finally {
      connection?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

it('requires owner and current origin, validates complete input, bounds JSON and retains errors over real HTTP', async () => {
  await withServer('none', async ({ origin, cookie, token, connection }) => {
    const url = `${origin}/api/settings/access-protection`;
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const read = () => fetch(url, { headers });
    const write = (value: unknown, customHeaders = headers) =>
      fetch(url, {
        method: 'PATCH',
        headers: customHeaders,
        body: JSON.stringify(value),
      });
    const input = { mode: 'enforce', rate: 10, burst: 200 };
    for (const unauthorized of [
      {},
      { authorization: `Bearer ${token}` },
      { cookie: `ariso.share_token=${token}` },
      { cookie: 'invalid=owner' },
    ] as Record<string, string>[]) {
      for (const method of ['GET', 'PATCH']) {
        const response = await fetch(url, { method, headers: unauthorized });
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
    for (const invalidOrigin of ['', 'https://foreign.example']) {
      const response = await write(input, {
        ...headers,
        origin: invalidOrigin,
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
    }
    const before = await (await read()).json();
    expect(before).toEqual({
      mode: 'observe',
      rate: 10,
      burst: 200,
      updatedAt: expect.any(String),
      clientIp: { ready: true, message: null },
    });
    expect(new Date(before.updatedAt).toISOString()).toBe(before.updatedAt);
    for (const [patch, field] of [
      [{ rate: 0 }, 'rate'],
      [{ burst: 1.5 }, 'burst'],
      [{ mode: 'blocked' }, 'mode'],
      [{ ownerExempt: false }, 'ownerExempt'],
    ] as const) {
      const response = await write({ ...input, ...patch });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: 'ACCESS_PROTECTION_INVALID_INPUT',
        fields: expect.arrayContaining([expect.objectContaining({ field })]),
      });
    }
    expect((await write({ mode: 'off' })).status).toBe(422);
    expect(
      (await fetch(url, { method: 'PATCH', headers, body: '{' })).status,
    ).toBe(400);
    expect(
      (
        await fetch(url, {
          method: 'PATCH',
          headers,
          body: ' '.repeat(256 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
    expect(await (await read()).json()).toEqual(before);
    const saved = await write(input);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject(input);
    connection.db.$client.exec(
      "CREATE TRIGGER reject_access_settings_http BEFORE UPDATE ON access_protection_settings BEGIN SELECT RAISE(ABORT, 'access settings write failed'); END",
    );
    const failed = await write({ ...input, rate: 20 });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      code: 'ACCESS_PROTECTION_INTERNAL_ERROR',
    });
    expect(await (await read()).json()).toMatchObject(input);
  });
}, 30000);

it('keeps observation available but rejects enforcement until source IP configuration is ready', async () => {
  await withServer(undefined, async ({ origin, cookie }) => {
    const url = `${origin}/api/settings/access-protection`;
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const before = await (await fetch(url, { headers })).json();
    expect(before.clientIp).toMatchObject({
      ready: false,
      message: expect.any(String),
    });
    const blocked = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ mode: 'enforce', rate: 10, burst: 200 }),
    });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      code: 'ACCESS_PROTECTION_IP_UNAVAILABLE',
    });
    expect(await (await fetch(url, { headers })).json()).toEqual(before);
    for (const mode of ['off', 'observe']) {
      const saved = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ mode, rate: 15, burst: 300 }),
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({
        mode,
        rate: 15,
        burst: 300,
        clientIp: { ready: false },
      });
    }
  });
}, 30000);
