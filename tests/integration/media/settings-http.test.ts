import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';
let directory: string;
let server: Awaited<ReturnType<typeof launch>> | undefined;
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
let origin: string;
let cookie: string;
let token: string;
function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
const settingsRequest = (
  value: unknown,
  headers: Record<string, string> = { cookie, origin },
) =>
  request('/api/settings/media', {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-media-settings-http-'));
  const dataDir = join(directory, 'data');
  server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
  });
  origin = `http://127.0.0.1:${server.port}`;
  await vi.waitFor(
    async () => {
      expect(server!.child.exitCode, server!.logs()).toBeNull();
      expect((await request('/api/health')).status).toBe(200);
    },
    { timeout: 15000 },
  );
  const setupEntries = server
    .logs()
    .split('\n')
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.module === 'identity.setup' && entry.event === 'setup-code'
          ? [entry]
          : [];
      } catch {
        return [];
      }
    });
  expect(setupEntries).toHaveLength(1);
  const setup = await request('/api/setup', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      code: setupEntries[0].code,
      email,
      password,
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    }),
  });
  expect(setup.status, await setup.clone().text()).toBe(200);
  const login = await request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status, await login.clone().text()).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  token = (await login.json()).token;
  connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
}, 30000);

afterEach(async () => {
  try {
    if (server) await stop(server.child, server.closed);
  } finally {
    server = undefined;
    connection?.close();
    connection = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it('restricts settings to an owner cookie and saved origin, including GET', async () => {
  for (const headers of [
    {},
    { authorization: `Bearer ${token}` },
    { cookie: `ariso.share_token=${token}` },
  ] as Record<string, string>[]) {
    expect((await request('/api/settings/media', { headers })).status).toBe(
      401,
    );
    expect(
      (await settingsRequest({ quality: 10 }, { ...headers, origin })).status,
    ).toBe(401);
  }
  for (const headers of [
    { cookie },
    { cookie, origin: 'https://foreign.example' },
  ] as Record<string, string>[]) {
    expect((await settingsRequest({ quality: 10 }, headers)).status).toBe(403);
  }
  const response = await request('/api/settings/media', {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject(initialMediaSettings);
});
it('validates the complete merged save, preserves mode parameters and returns field errors', async () => {
  const text = {
    watermarkMode: 'text',
    watermarkText: '你好 Ariso',
    watermarkFontSize: 3.5,
    defaultLinkVersion: 'watermark',
  };
  const saved = await settingsRequest(text);
  expect(saved.status, await saved.clone().text()).toBe(200);
  expect(await saved.json()).toMatchObject({
    ...initialMediaSettings,
    ...text,
  });
  for (const [value, field] of [
    [{ watermarkMode: 'off', quality: 10 }, 'defaultLinkVersion'],
    [{ watermarkFont: '/tmp/font' }, 'watermarkFont'],
    [{ watermarkText: '' }, 'watermarkText'],
    [{ typo: true }, 'typo'],
  ] as const) {
    const response = await settingsRequest(value);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'MEDIA_SETTINGS_INVALID',
      fields: expect.arrayContaining([expect.objectContaining({ field })]),
    });
  }
  const current = await request('/api/settings/media', { headers: { cookie } });
  expect(await current.json()).toMatchObject({ ...text, quality: 82 });
  expect(
    (
      await settingsRequest({
        watermarkMode: 'off',
        defaultLinkVersion: 'original',
      })
    ).status,
  ).toBe(200);
  const restored = await settingsRequest({ watermarkMode: 'text' });
  expect(await restored.json()).toMatchObject({
    ...text,
    defaultLinkVersion: 'original',
  });
  const malformed = await request('/api/settings/media', {
    method: 'PATCH',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: '{',
  });
  expect(malformed.status).toBe(400);
});

it('rejects NUL text before saving any part of the settings patch', async () => {
  const before = await request('/api/settings/media', { headers: { cookie } });
  const saved = await before.json();
  const response = await settingsRequest({
    watermarkMode: 'text',
    watermarkText: 'A\0B',
    quality: 10,
  });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    code: 'MEDIA_SETTINGS_INVALID',
    fields: expect.arrayContaining([
      expect.objectContaining({ field: 'watermarkText' }),
    ]),
  });
  const after = await request('/api/settings/media', { headers: { cookie } });
  expect(await after.json()).toEqual(saved);
});
