import { readFile, readdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  mediaImages,
  mediaPreviews,
} from '../../../src/server/media/schema.ts';
import { requireMediaSettings } from '../../../src/server/media/settings.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
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
let settings: Record<string, unknown>;
let dataDir: string;

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}

function fileForm(
  bytes: Buffer,
  options: unknown = { target: 'compressed', settings },
  name = 'preview.png',
) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
    name,
  );
  form.append('options', JSON.stringify(options));
  return form;
}

async function upload(
  body: FormData,
  headers: Record<string, string> = { cookie, origin },
) {
  const response = await request('/api/media/previews', {
    method: 'POST',
    headers,
    body,
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  return response;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-preview-http-'));
  dataDir = join(directory, 'data');
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
  const saved = await request('/api/settings/media', { headers: { cookie } });
  expect(saved.status).toBe(200);
  settings = Object.fromEntries(
    Object.entries(await saved.json()).filter(
      ([key]) =>
        ![
          'id',
          'updatedAt',
          'defaultVisibility',
          'defaultLinkVersion',
          'concurrency',
        ].includes(key),
    ),
  );
}, 30000);

afterAll(async () => {
  try {
    if (server) await stop(server.child, server.closed);
  } finally {
    server = undefined;
    connection?.close();
    connection = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

async function finished(id: string) {
  let state:
    | {
        status: string;
        resultUrl: string | null;
        result: {
          mime: string;
          width: number;
          height: number;
          byteSize: number;
        } | null;
        unavailableReason?: string | null;
      }
    | undefined;
  await vi.waitFor(
    async () => {
      const response = await request(`/api/media/previews/${id}`, {
        headers: { cookie },
      });
      expect(response.status, await response.clone().text()).toBe(200);
      state = await response.json();
      expect(['succeeded', 'failed', 'cancelled']).toContain(state!.status);
    },
    { timeout: 20000 },
  );
  return state!;
}

it('requires owner Cookie and origin before receiving bytes, and protects every status/result/cancel route', async () => {
  const before = connection!.db.select().from(mediaPreviews).all().length;
  const bytes = await readFile(join(fixtures, 'source.png'));
  for (const headers of [
    { origin },
    { origin, authorization: `Bearer ${token}` },
    { origin, cookie: `ariso.share_token=${token}` },
  ] as Record<string, string>[]) {
    expect((await upload(fileForm(bytes), headers)).status).toBe(401);
  }
  for (const headers of [
    { cookie },
    { cookie, origin: 'https://foreign.example' },
  ] as Record<string, string>[]) {
    expect((await upload(fileForm(bytes), headers)).status).toBe(403);
  }
  expect(connection!.db.select().from(mediaPreviews).all()).toHaveLength(
    before,
  );
  for (const [path, method] of [
    ['/api/media/previews/missing', 'GET'],
    ['/api/media/previews/missing/result', 'GET'],
    ['/api/media/previews/missing', 'DELETE'],
  ] as const) {
    expect((await request(path, { method })).status).toBe(401);
    expect(
      (
        await request(path, {
          method,
          headers: method === 'DELETE' ? { cookie, origin } : { cookie },
        })
      ).status,
    ).toBe(404);
  }
});

it('renders unsaved parameters and original bytes privately without changing settings or the library', async () => {
  const saved = requireMediaSettings(connection!.db);
  const bytes = await readFile(join(fixtures, 'source.png'));
  const response = await upload(
    fileForm(bytes, {
      target: 'compressed',
      settings: { ...settings, outputFormat: 'webp', maxEdge: 32, quality: 55 },
    }),
  );
  expect(response.status, await response.clone().text()).toBe(202);
  const preview = await response.json();
  expect(preview).toMatchObject({
    id: expect.any(String),
    target: 'compressed',
  });
  expect(preview).not.toHaveProperty('snapshot');
  const state = await finished(preview.id);
  expect(state).toMatchObject({
    status: 'succeeded',
    result: { mime: 'image/webp', width: 32, height: 24 },
  });
  const result = await request(state.resultUrl!, { headers: { cookie } });
  expect(result.status).toBe(200);
  expect(result.headers.get('content-type')).toBe('image/webp');
  expect(result.headers.get('cache-control')).toBe('private, no-store');
  expect(result.headers.get('x-content-type-options')).toBe('nosniff');
  expect((await result.arrayBuffer()).byteLength).toBe(state.result!.byteSize);
  expect((await request(state.resultUrl!)).status).toBe(401);
  const original = await upload(
    fileForm(bytes, { target: 'original', settings }),
  );
  expect(original.status, await original.clone().text()).toBe(202);
  const originalState = await finished((await original.json()).id);
  const originalResult = await request(originalState.resultUrl!, {
    headers: { cookie },
  });
  expect(Buffer.from(await originalResult.arrayBuffer())).toEqual(bytes);
  const svgBytes = await readFile(join(fixtures, 'static.svg'));
  const svg = await upload(
    fileForm(svgBytes, { target: 'original', settings }, 'source.svg'),
  );
  expect(svg.status, await svg.clone().text()).toBe(202);
  const svgState = await finished((await svg.json()).id);
  expect((await request(svgState.resultUrl!)).status).toBe(401);
  const svgResult = await request(svgState.resultUrl!, { headers: { cookie } });
  expect(svgResult.status).toBe(200);
  expect(svgResult.headers.get('content-type')).toBe('image/svg+xml');
  expect(svgResult.headers.get('content-disposition')).toMatch(
    /^attachment(?:;|$)/i,
  );
  expect(Buffer.from(await svgResult.arrayBuffer())).toEqual(svgBytes);
  expect(requireMediaSettings(connection!.db)).toEqual(saved);
  expect(connection!.db.select().from(mediaImages).all()).toEqual([]);
});

it('keeps a non-applicable target explicit and rejects result bytes instead of substituting a thumbnail', async () => {
  const bytes = await readFile(join(fixtures, 'source.png'));
  const response = await upload(
    fileForm(bytes, {
      target: 'watermark',
      settings: { ...settings, watermarkMode: 'off' },
    }),
  );
  expect(response.status).toBe(202);
  const id = (await response.json()).id;
  const state = await finished(id);
  expect(state).toMatchObject({
    status: 'succeeded',
    result: null,
    resultUrl: null,
    unavailableReason: expect.stringContaining('水印'),
  });
  expect(
    (await request(`/api/media/previews/${id}/result`, { headers: { cookie } }))
      .status,
  ).toBe(409);
});

it('deletes a settled preview idempotently after its exact temporary directory is cleaned', async () => {
  const bytes = await readFile(join(fixtures, 'source.png'));
  const response = await upload(
    fileForm(bytes, { target: 'original', settings }),
  );
  expect(response.status).toBe(202);
  const id = (await response.json()).id;
  await finished(id);
  const directory = join(dataDir, 'tmp', `preview-${id}`);
  expect(await readdir(directory)).toContain('result');
  for (let attempt = 0; attempt < 2; attempt++) {
    const cancelled = await request(`/api/media/previews/${id}`, {
      method: 'DELETE',
      headers: { cookie, origin },
    });
    expect(cancelled.status, await cancelled.clone().text()).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      id,
      status: 'cancelled',
      cleanupStatus: 'deleted',
      resultUrl: null,
    });
  }
  await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(
    (await request(`/api/media/previews/${id}/result`, { headers: { cookie } }))
      .status,
  ).toBe(409);
});

it('returns 410 for an expired result and leaves its expiration state observable', async () => {
  const bytes = await readFile(join(fixtures, 'source.png'));
  const response = await upload(
    fileForm(bytes, { target: 'original', settings }),
  );
  expect(response.status).toBe(202);
  const id = (await response.json()).id;
  await finished(id);
  connection!.db
    .update(mediaPreviews)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(mediaPreviews.id, id))
    .run();
  const expired = await request(`/api/media/previews/${id}/result`, {
    headers: { cookie },
  });
  expect(expired.status).toBe(410);
  expect(await expired.json()).toMatchObject({ code: 'MEDIA_PREVIEW_EXPIRED' });
  const state = await request(`/api/media/previews/${id}`, {
    headers: { cookie },
  });
  expect(await state.json()).toMatchObject({
    id,
    status: 'expired',
    resultUrl: null,
  });
});

it('rejects malformed multipart/JSON/settings and counts actual bytes against current upload settings', async () => {
  const bytes = await readFile(join(fixtures, 'source.png'));
  const cases: [FormData, number][] = [];
  const missing = fileForm(bytes);
  missing.delete('options');
  cases.push([missing, 400]);
  const extra = fileForm(bytes);
  extra.append('ignored', 'no');
  cases.push([extra, 400]);
  const malformed = fileForm(bytes);
  malformed.set('options', '{');
  cases.push([malformed, 400]);
  cases.push([fileForm(bytes, { target: 'compressed', settings: {} }), 422]);
  cases.push([
    fileForm(bytes, {
      target: 'compressed',
      settings: { ...settings, concurrency: 4 },
    }),
    422,
  ]);
  for (const [body, status] of cases) {
    const response = await upload(body);
    expect(response.status, await response.clone().text()).toBe(status);
    const failure = await response.json();
    expect(failure.previewId).toEqual(expect.any(String));
    const failedState = await request(
      `/api/media/previews/${failure.previewId}`,
      { headers: { cookie } },
    );
    expect(failedState.status).toBe(200);
    expect(await failedState.json()).toMatchObject({
      id: failure.previewId,
      status: 'failed',
      cleanupStatus: 'deleted',
      error: expect.any(String),
    });
  }
  connection!.db
    .update(uploadSettings)
    .set({ maxFileBytes: 16 })
    .where(eq(uploadSettings.id, 1))
    .run();
  const tooLarge = await upload(fileForm(Buffer.alloc(17)));
  expect(tooLarge.status, await tooLarge.clone().text()).toBe(413);
  expect(connection!.db.select().from(mediaImages).all()).toEqual([]);
});
