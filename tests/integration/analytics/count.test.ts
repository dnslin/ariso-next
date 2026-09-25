import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccessCollector } from '../../../src/server/analytics/collector.ts';
import * as analytics from '../../../src/server/analytics/collector.ts';
import * as local from '../../../src/server/storage/local.ts';
import * as delivery from '../../../src/server/delivery/response.ts';
import {
  mediaImages,
  mediaSettings,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { createCountFixture } from './count-fixture.ts';

const dependencies = vi.hoisted(() => ({
  runtime: vi.fn(),
  owner: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: dependencies.runtime,
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  readOptionalOwner: dependencies.owner,
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: dependencies.error }),
}));
import { GET, HEAD } from '../../../src/app/i/[imageId]/route.ts';

let fixture: Awaited<ReturnType<typeof createCountFixture>>;
let collector: ReturnType<typeof createAccessCollector>;
let server: Server;
let origin: string;
let beforeBody: (() => Promise<void> | void) | undefined;
let stream: ReadStream;
let transfer: Promise<void>;
const readObject = local.readObject;

beforeEach(async () => {
  fixture = await createCountFixture();
  collector = createAccessCollector();
  dependencies.runtime.mockReturnValue({
    connection: fixture.connection,
    config: { dataDir: fixture.directory, logLevel: 'info' },
  });
  dependencies.owner.mockImplementation(async (request: Request) =>
    request.headers.get('cookie') === 'owner=yes' ? { id: 'owner' } : null,
  );
  dependencies.error.mockReset();
  vi.spyOn(analytics, 'getAccessCollector').mockReturnValue(collector);
  vi.spyOn(local, 'readObject').mockImplementation(async (...args) => {
    const opened = await readObject(...args);
    stream = opened.stream;
    return opened;
  });
  beforeBody = undefined;
  server = createServer((incoming, outgoing) => {
    transfer = (async () => {
      const abort = new AbortController();
      outgoing.once('close', () => abort.abort());
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const request = new Request(`${origin}${incoming.url}`, {
        method: incoming.method,
        headers,
        signal: abort.signal,
      });
      const response = await (incoming.method === 'HEAD' ? HEAD : GET)(
        request,
        { params: Promise.resolve({ imageId: fixture.imageId }) },
      );
      await beforeBody?.();
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        await pipeline(
          Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
          outgoing,
        );
      else outgoing.end();
    })().catch((error: unknown) => {
      // HTTP failures remain observable to the client and assertions below.
      outgoing.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await transfer;
  vi.restoreAllMocks();
  await fixture.close();
});
async function request(query = '?type=original', init: RequestInit = {}) {
  return fetch(`${origin}/i/${fixture.imageId}${query}`, {
    ...init,
    signal: AbortSignal.timeout(10000),
  });
}
async function complete(query = '?type=original', init: RequestInit = {}) {
  const response = await request(query, init);
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture.bytes);
  return response;
}

it.each(['original', 'compressed', 'watermark'])(
  'counts each %s GET and download once without database writes',
  async (version) => {
    fixture.db.$client.pragma('query_only = ON');
    await complete(`?type=${version}`);
    await complete(`?type=${version}&download=1`);
    expect(collector.snapshot().accepted).toBe(2);
    expect(collector.snapshot().increments).toEqual([
      expect.objectContaining({ version, count: 2 }),
    ]);
  },
);

it('counts the actual original when the default version is inapplicable', async () => {
  fixture.db
    .update(mediaSettings)
    .set({ defaultLinkVersion: 'compressed' })
    .run();
  fixture.db
    .update(mediaImages)
    .set({ classification: 'animated', format: 'GIF' })
    .run();
  expect((await complete('')).headers.get('x-ariso-image-version')).toBe(
    'original',
  );
  expect(collector.snapshot().increments[0]).toMatchObject({
    version: 'original',
    count: 1,
  });
});

it('excludes owner/private/thumbnail/HEAD/304 and rejected or missing content', async () => {
  await complete('?type=original', { headers: { cookie: 'owner=yes' } });
  await complete('?type=thumbnail');
  const head = await request('?type=original', { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  const unchanged = await request('?type=original', {
    headers: { 'if-none-match': head.headers.get('etag')! },
  });
  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe('');
  const precondition = await request('?type=original', {
    headers: { 'if-match': '"missing"' },
  });
  expect(precondition.status).toBe(412);
  await precondition.text();
  fixture.db.update(mediaImages).set({ visibility: 'private' }).run();
  const privateResponse = await request();
  expect(privateResponse.status).toBe(401);
  await privateResponse.text();
  await complete('?type=original', { headers: { cookie: 'owner=yes' } });
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'public', trashedAt: new Date() })
    .run();
  expect((await request()).status).toBe(404);
  fixture.db.update(mediaImages).set({ trashedAt: null }).run();
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  expect((await request()).status).toBe(409);
  expect(collector.snapshot().accepted).toBe(0);
});

it('reads committed timezone after response preparation and keeps already archived dates unchanged', async () => {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  beforeBody = async () => {
    ready.resolve();
    await release.promise;
  };
  const pending = complete();
  await ready.promise;
  expect(collector.snapshot().accepted).toBe(0);
  fixture.db
    .update(siteSettings)
    .set({ timeZone: 'America/Los_Angeles' })
    .run();
  release.resolve();
  await pending;
  const first = collector.snapshot().increments[0]!;
  expect(first.timezone).toBe('America/Los_Angeles');
  beforeBody = undefined;
  fixture.db.update(siteSettings).set({ timeZone: 'Asia/Shanghai' }).run();
  await complete();
  expect(collector.snapshot().increments[0]).toEqual(first);
  expect(collector.snapshot().increments[1]?.timezone).toBe('Asia/Shanghai');
});

it('does not retry or duplicate a repeated delivery callback within one request', async () => {
  const prepare = delivery.prepareImageDelivery;
  vi.spyOn(delivery, 'prepareImageDelivery').mockImplementation(
    (request, id, options) =>
      prepare(request, id, {
        ...options,
        onAccess(event) {
          options.onAccess?.(event);
          options.onAccess?.({ ...event });
        },
      }),
  );
  await complete();
  await complete();
  expect(collector.snapshot().accepted).toBe(2);
});

it.each(['first', 'later'] as const)(
  'handles %s-block real file failure over HTTP',
  async (when) => {
    beforeBody = () => {
      if (when === 'first')
        stream.destroy(new Error('injected first-read EIO'));
      else
        stream.once('data', () =>
          stream.destroy(new Error('injected later-read EIO')),
        );
    };
    await expect(complete()).rejects.toThrow();
    await transfer;
    expect(collector.snapshot().accepted).toBe(when === 'first' ? 0 : 1);
    expect(dependencies.error).toHaveBeenCalled();
  },
);

it('keeps one count after client cancellation following the first network block', async () => {
  let received = 0;
  await new Promise<void>((resolve, reject) => {
    const req = httpRequest(
      `${origin}/i/${fixture.imageId}?type=original`,
      (response) => {
        response.once('data', (chunk: Buffer) => {
          received += chunk.length;
          response.destroy();
          resolve();
        });
        response.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
  await transfer;
  expect(received).toBeGreaterThan(0);
  expect(received).toBeLessThan(fixture.bytes.length);
  expect(collector.snapshot().accepted).toBe(1);
});

it('logs aggregation failure with event context and still returns complete legal content', async () => {
  fixture.db.update(siteSettings).set({ timeZone: 'invalid/timezone' }).run();
  await complete();
  expect(collector.snapshot().accepted).toBe(0);
  expect(dependencies.error).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      err: expect.any(Error),
      imageId: fixture.imageId,
      storageId: fixture.storage.id,
      actualVersion: 'original',
      occurredAt: expect.any(Date),
      timezone: 'invalid/timezone',
    }),
    'Access aggregation failed',
  );
});

it('logs capacity loss without truncating content', async () => {
  for (let i = 0; i < analytics.ACCESS_BUFFER_CAPACITY; i++)
    collector.recordAccess(
      {
        imageId: String(i),
        storageId: fixture.storage.id,
        actualVersion: 'original',
        occurredAt: new Date(),
      },
      'UTC',
    );
  await complete();
  expect(collector.snapshot()).toMatchObject({ dropped: 1, incomplete: true });
  expect(dependencies.error).toHaveBeenCalledWith(
    expect.objectContaining({ imageId: fixture.imageId }),
    expect.stringContaining('buffer full'),
  );
});

it('does not count a client cancelled before its first body block', async () => {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  beforeBody = async () => {
    ready.resolve();
    await release.promise;
  };
  const abort = new AbortController();
  const pending = fetch(`${origin}/i/${fixture.imageId}?type=original`, {
    signal: abort.signal,
  }).catch((error: unknown) => error);
  await ready.promise;
  expect(collector.snapshot().accepted).toBe(0);
  abort.abort();
  expect(await pending).toBeInstanceOf(Error);
  // Wait for the server to observe the actual closed HTTP connection before releasing bytes.
  await vi.waitFor(() => expect(stream.destroyed).toBe(true));
  release.resolve();
  await transfer;
  expect(collector.snapshot().accepted).toBe(0);
});
