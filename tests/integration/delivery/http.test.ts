import { parse as parseDisposition } from 'content-disposition';
import { request as httpRequest } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { launchDelivery } from '../../experiments/delivery/harness.ts';
import { session } from '../../experiments/identity/schema.ts';
import type { Scenario } from '../../experiments/delivery/fixture.ts';
let app: Awaited<ReturnType<typeof launchDelivery>>;
let size: number;
let serial = 0;
const id = () => `case-${++serial}`;
const cache = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
};
async function settled(key: string, count: number, opened = 1) {
  await vi.waitFor(async () => {
    const probe = await app.probe(key);
    expect(probe.opened).toBe(opened);
    expect(probe.closed).toBe(opened);
    expect(probe.events).toHaveLength(count);
  });
}
beforeAll(async () => {
  app = await launchDelivery(AbortSignal.timeout(150000));
  size = (await stat(join(app.objects, 'sample'))).size;
}, 180000);
afterAll(async () => {
  if (app) {
    await mkdir('test-results/delivery', { recursive: true });
    await writeFile('test-results/delivery/server.log', app.logs());
    await app.stop();
  }
});

it('real Next GET returns complete bytes, ignores Range, and records one start', async () => {
  for (const range of [undefined, 'bytes=0-1', 'bytes=99999999-']) {
    const key = id();
    await app.control(key, { size });
    const response = await app.request(`/file?id=${key}`, {
      headers: range ? { Range: range } : {},
    });
    cache(response);
    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('none');
    expect(response.headers.get('content-length')).toBe(String(size));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      await readFile(join(app.objects, 'sample')),
    );
    await settled(key, 1);
    expect((await app.probe(key)).events[0].actualVersion).toBe('original');
  }
}, 60000);

it('HEAD/304/412 close files without body delivery; dates are ignored without Last-Modified', async () => {
  const cases: [string, Record<string, string>, number][] = [
    ['HEAD', {}, 200],
    ['GET', { 'If-None-Match': 'W/"sample"' }, 304],
    ['HEAD', { 'If-None-Match': '*' }, 304],
    ['GET', { 'If-Match': '"other"' }, 412],
    ['GET', { 'If-Match': 'W/"sample"', 'If-None-Match': '*' }, 412],
    ['GET', { 'If-Match': '*', 'If-None-Match': '"other", "sample"' }, 304],
    ['GET', { 'If-Modified-Since': 'Wed, 21 Oct 2099 07:28:00 GMT' }, 200],
    ['GET', { 'If-Unmodified-Since': 'Wed, 21 Oct 1999 07:28:00 GMT' }, 200],
    ['HEAD', { 'If-Match': '"missing"' }, 412],
  ];
  for (const [method, headers, expected] of cases) {
    const key = id();
    await app.control(key, { size });
    const response = await app.request(`/file?id=${key}`, { method, headers });
    cache(response);
    expect(response.status).toBe(expected);
    expect(response.headers.has('last-modified')).toBe(false);
    const body = await response.text();
    if (method === 'HEAD' || expected === 304) expect(body).toBe('');
    await settled(key, method === 'GET' && expected === 200 ? 1 : 0);
  }
});

it('final async authorization rejects private, unavailable, disabled and not-ready states before conditions', async () => {
  for (const [state, status] of [
    [{ visibility: 'private' }, 401],
    [{ unavailable: true }, 404],
    [{ enabled: false }, 409],
    [{ ready: false }, 409],
  ] as [Partial<Scenario>, number][]) {
    const key = id();
    await app.control(key, { size, gate: true });
    const pending = app.request(`/file?id=${key}`, {
      headers: { 'If-None-Match': '*' },
    });
    await vi.waitFor(async () => expect((await app.probe(key)).opened).toBe(1));
    expect((await app.probe(key)).events).toHaveLength(0);
    await app.control(key, state, true);
    const response = await pending;
    cache(response);
    expect(response.status).toBe(status);
    await response.text();
    await settled(key, 0);
  }
});

it('real owner Cookie permits private access, revoked Cookie is rechecked and public access then counts', async () => {
  const cookie = await app.login();
  const owner = id();
  await app.control(owner, { size, visibility: 'private' });
  const response = await app.request(`/file?id=${owner}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  await settled(owner, 0);
  for (const visibility of ['private', 'public'] as const) {
    const fresh = await app.login();
    const key = id();
    await app.control(key, { size, gate: true, visibility });
    const pending = app.request(`/file?id=${key}`, {
      headers: { cookie: fresh },
    });
    await vi.waitFor(async () => expect((await app.probe(key)).opened).toBe(1));
    app.connection.db.delete(session).run();
    await app.control(key, {}, true);
    const result = await pending;
    expect(result.status).toBe(visibility === 'private' ? 401 : 200);
    await result.arrayBuffer();
    await settled(key, visibility === 'private' ? 0 : 1);
  }
}, 60000);

it('one version reselection succeeds; a second conflict returns IMAGE_CHANGED and releases both handles', async () => {
  for (const conflict of [false, true]) {
    const key = id();
    await app.control(key, { size, gate: true });
    const pending = app.request(`/file?id=${key}`);
    await vi.waitFor(async () => expect((await app.probe(key)).opened).toBe(1));
    await app.control(
      key,
      { objectId: 'replacement', version: 'compressed', gate: conflict },
      true,
    );
    if (conflict) {
      await vi.waitFor(async () =>
        expect((await app.probe(key)).opened).toBe(2),
      );
      await app.control(key, { objectId: 'sample' }, true);
    }
    const response = await pending;
    expect(response.status).toBe(conflict ? 409 : 200);
    if (conflict)
      expect(await response.json()).toMatchObject({ code: 'IMAGE_CHANGED' });
    else {
      expect(response.headers.get('etag')).toBe('"replacement"');
      await response.arrayBuffer();
    }
    await settled(key, conflict ? 0 : 1, 2);
  }
});

it('read failures run through Next HTTP: first read never counts, midstream disconnect keeps one count', async () => {
  for (const fault of ['first-read', 'mid-read'] as const) {
    const key = id();
    await app.control(key, {
      size: 16 * 1024 * 1024,
      objectId: 'large',
      fault,
    });
    await expect(
      (async () => {
        const response = await app.request(`/file?id=${key}`);
        await response.arrayBuffer();
      })(),
    ).rejects.toThrow();
    await settled(key, fault === 'first-read' ? 0 : 1);
    const errors = (await app.probe(key)).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('EIO');
  }
});

it('real client cancellation before headers and after first network chunk releases file handles', async () => {
  const before = id();
  await app.control(before, { size, gate: true });
  const abort = new AbortController();
  const pending = app
    .request(`/file?id=${before}`, { signal: abort.signal })
    .catch((error: unknown) => error);
  await vi.waitFor(async () =>
    expect((await app.probe(before)).opened).toBe(1),
  );
  abort.abort();
  await pending;
  await settled(before, 0);
  const after = id();
  await app.control(after, { size: 16 * 1024 * 1024, objectId: 'large' });
  let received = 0;
  await new Promise<void>((resolve, reject) => {
    const req = httpRequest(`${app.origin}/file?id=${after}`, (res) => {
      res.once('data', (chunk: Buffer) => {
        received += chunk.length;
        res.destroy();
        resolve();
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
  expect(received).toBeGreaterThan(0);
  expect(received).toBeLessThan(16 * 1024 * 1024);
  await settled(after, 1);
});

it('thumbnail is excluded, attachments count normally, and counter failure does not truncate bytes', async () => {
  for (const state of [
    { version: 'thumbnail' },
    { fault: 'counter' },
    { version: 'watermark' },
    {},
  ] as Partial<Scenario>[]) {
    const key = id();
    await app.control(key, { size, ...state });
    const response = await app.request(`/file?id=${key}&download=1`);
    cache(response);
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      await readFile(join(app.objects, 'sample')),
    );
    await settled(key, state.version === 'thumbnail' ? 0 : 1);
    if (state.fault)
      expect((await app.probe(key)).errors.join(' ')).toContain('analytics');
  }
});

it('missing and inconsistent physical files cannot return 304 or emit an event', async () => {
  for (const state of [{ objectId: 'absent', size }, { size: size + 1 }]) {
    const key = id();
    await app.control(key, state);
    const response = await app.request(`/file?id=${key}`, {
      headers: { 'If-None-Match': '*' },
    });
    cache(response);
    expect(response.status).toBe(state.objectId ? 404 : 500);
    expect(await response.json()).toMatchObject({
      code: state.objectId ? 'STORAGE_OBJECT_MISSING' : 'DELIVERY_FAILED',
    });
    await settled(key, 0, state.objectId ? 0 : 1);
    expect((await app.probe(key)).errors.length).toBeGreaterThan(0);
  }
});

it('current owner remains authorized after public becomes private during open', async () => {
  const cookie = await app.login();
  const key = id();
  await app.control(key, { size, gate: true });
  const pending = app.request(`/file?id=${key}`, { headers: { cookie } });
  await vi.waitFor(async () => expect((await app.probe(key)).opened).toBe(1));
  await app.control(key, { visibility: 'private' }, true);
  const response = await pending;
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  await settled(key, 0);
});

it('an already started stream finishes after permission changes; the next request is rejected', async () => {
  const key = id();
  await app.control(key, { size: 16 * 1024 * 1024, objectId: 'large' });
  const response = await app.request(`/file?id=${key}`);
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(first.done).toBe(false);
  await app.control(key, { visibility: 'private' });
  let received = first.value!.byteLength;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    received += next.value.byteLength;
  }
  expect(received).toBe(16 * 1024 * 1024);
  await settled(key, 1);
  const next = await app.request(`/file?id=${key}`);
  expect(next.status).toBe(401);
  await next.text();
  await settled(key, 1);
});

it('HTTP filename and cache matrix uses the supplied format metadata and UTF-8 names', async () => {
  for (const [name, extension, type, expected] of [
    ['旅行.final', 'webp', 'image/webp', '旅行.final.webp'],
    ['旅行.webp', 'webp', 'image/webp', '旅行.webp'],
    ['旅行.jpg', 'webp', 'image/webp', '旅行.jpg.webp'],
    ['旅行.JPEG', 'jpg', 'image/jpeg', '旅行.jpg'],
    ['../\r\n', 'png', 'image/png', 'probe-image.png'],
    ['示例.svg', 'svg', 'image/svg+xml', '示例.svg'],
  ]) {
    const key = id();
    await app.control(key, {
      size,
      displayName: name,
      extension,
      contentType: type,
    });
    const response = await app.request(`/file?id=${key}`);
    cache(response);
    expect(response.headers.get('content-type')).toBe(type);
    const disposition = response.headers.get('content-disposition')!;
    expect(
      disposition.startsWith(
        type === 'image/svg+xml' ? 'attachment;' : 'inline;',
      ),
    ).toBe(true);
    expect(parseDisposition(disposition).parameters.filename).toBe(expected);
    await response.arrayBuffer();
    await settled(key, 1);
  }
});
