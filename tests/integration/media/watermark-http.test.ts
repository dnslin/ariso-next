import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mediaWatermarkAssets } from '../../../src/server/media/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>> | undefined;
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
let origin: string;
let cookie: string;
let token: string;
const fixtures = resolve('tests/fixtures/media-formats');

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}

function fileForm(bytes: Buffer, name = 'watermark.png') {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
    name,
  );
  return form;
}

async function upload(
  body: FormData,
  headers: Record<string, string> = { cookie, origin },
) {
  const response = await request('/api/media/watermark-assets', {
    method: 'POST',
    headers,
    body,
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response;
}

function readyAssets() {
  return connection!.db
    .select()
    .from(mediaWatermarkAssets)
    .where(eq(mediaWatermarkAssets.status, 'ready'))
    .all();
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-watermark-http-'));
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

it('requires the owner Cookie and the saved origin before accepting watermark bytes', async () => {
  const bytes = await readFile(join(fixtures, 'source.png'));
  const unauthenticated: Record<string, string>[] = [
    { origin },
    { origin, authorization: `Bearer ${token}` },
    { origin, cookie: `ariso.share_token=${encodeURIComponent(token)}` },
  ];
  for (const headers of unauthenticated) {
    const response = await upload(fileForm(bytes), headers);
    expect(response.status, await response.clone().text()).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  }
  for (const headers of [
    { cookie },
    { cookie, origin: 'https://foreign.example' },
  ] as Record<string, string>[]) {
    const response = await upload(fileForm(bytes), headers);
    expect(response.status, await response.clone().text()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
  }
  expect(connection!.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});

it.each([
  ['source.png', 'PNG', 'image/png'],
  ['static.webp', 'WEBP', 'image/webp'],
  ['static.svg', 'SVG', 'image/svg+xml'],
])(
  'accepts real %s content and retains the original bytes',
  async (file, format, mime) => {
    const bytes = await readFile(join(fixtures, file));
    const before = Date.now();
    const response = await upload(fileForm(bytes, 'misleading.jpg'));
    expect(response.status, await response.clone().text()).toBe(201);
    const asset = await response.json();
    expect(asset).toMatchObject({
      id: expect.any(String),
      path: expect.any(String),
      format,
      mime,
      width: 64,
      height: 48,
      byteSize: bytes.length,
      expiresAt: expect.any(String),
      status: 'ready',
    });
    expect(Date.parse(asset.expiresAt)).toBeGreaterThan(before);
    expect(
      await readFile(
        join(directory, 'data', 'assets', 'watermarks', asset.path),
      ),
    ).toEqual(bytes);
    expect(readyAssets()).toMatchObject([
      {
        id: asset.id,
        path: asset.path,
        format,
        mime,
        width: 64,
        height: 48,
        byteSize: bytes.length,
        expiresAt: new Date(asset.expiresAt),
      },
    ]);
  },
);

it('rejects animation and invalid image bytes without exposing a ready asset', async () => {
  for (const bytes of [
    await readFile(join(fixtures, 'animated.png')),
    await readFile(join(fixtures, 'animated.webp')),
    Buffer.from([0, 1, 2, 3, 255, 254, 253, 252]),
  ]) {
    const response = await upload(fileForm(bytes));
    expect(response.status, await response.clone().text()).toBe(415);
    expect(await response.json()).toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
    });
    expect(readyAssets()).toEqual([]);
  }
});

it('rejects a file one byte over 5 MiB without creating an asset', async () => {
  const response = await upload(fileForm(Buffer.alloc(5 * 1024 * 1024 + 1)));
  expect(response.status, await response.clone().text()).toBe(413);
  expect(readyAssets()).toEqual([]);
  expect(connection!.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});

it('requires exactly one file field and rejects additional fields or files', async () => {
  const bytes = await readFile(join(fixtures, 'source.png'));
  const multiple = fileForm(bytes);
  multiple.append('file', new Blob([new Uint8Array(bytes)]), 'second.png');
  const extraField = fileForm(bytes);
  extraField.append('label', 'watermark');
  const textFile = new FormData();
  textFile.append('file', 'not a file');
  const wrongField = new FormData();
  wrongField.append('asset', new Blob([new Uint8Array(bytes)]), 'source.png');
  for (const body of [
    multiple,
    extraField,
    new FormData(),
    textFile,
    wrongField,
  ]) {
    const response = await upload(body);
    expect(response.status, await response.clone().text()).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'MEDIA_WATERMARK_REQUEST',
    });
  }
  expect(connection!.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});
