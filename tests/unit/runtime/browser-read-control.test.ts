import { createServer } from 'node:http';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { installReadControl } from '../../../e2e/read-control.mjs';

type ReadControl = {
  pause: (paths: string[]) => void;
  readonly held: number;
  count: (path: string) => number;
  release: () => void;
  restore: () => void;
};
let origin: string;
let browser: {
  fetch: typeof fetch;
  location: { href: string };
  __motionReadControl: ReadControl;
};
const received: string[] = [];
const delayed: (() => void)[] = [];
const original = globalThis.fetch;
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk.toString();
  received.push(request.url!);
  const send = () =>
    response.end(
      JSON.stringify({
        url: request.url,
        method: request.method,
        authorization: request.headers.authorization,
        body,
      }),
    );
  if (request.url!.includes('wait=1')) delayed.push(send);
  else send();
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing server port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
beforeEach(() => {
  browser = { fetch: original, location: { href: origin } } as typeof browser;
  vi.stubGlobal('window', browser);
  installReadControl();
});
afterEach(() => {
  browser.__motionReadControl.restore();
  delayed.splice(0).forEach((send) => send());
  received.length = 0;
  vi.unstubAllGlobals();
});

it.each(['string', 'URL', 'Request'])(
  'pauses a real GET response supplied as %s until released',
  async (kind) => {
    const control = browser.__motionReadControl;
    control.pause(['/api/images']);
    const url = `${origin}/api/images`;
    const input =
      kind === 'URL'
        ? new URL(url)
        : kind === 'Request'
          ? new Request(url)
          : url;
    let delivered = false;
    const pending = browser.fetch(input).then((response) => {
      delivered = true;
      return response;
    });
    await vi.waitFor(() => expect(control.held).toBe(1));
    expect(received).toEqual(['/api/images']);
    expect(delivered).toBe(false);
    expect(control.count('/api/images')).toBe(1);
    control.release();
    expect(await (await pending).json()).toMatchObject({
      url: '/api/images',
      method: 'GET',
    });
    expect(control.held).toBe(0);
    expect(await (await browser.fetch(url)).json()).toMatchObject({
      method: 'GET',
    });
  },
);

it('passes non-target GETs and Request POSTs through without pausing', async () => {
  const control = browser.__motionReadControl;
  control.pause(['/api/images']);
  expect(
    await (await browser.fetch(`${origin}/api/other`)).json(),
  ).toMatchObject({ url: '/api/other' });
  const posted = await browser.fetch(
    new Request(`${origin}/api/images`, { method: 'POST', body: 'payload' }),
  );
  expect(await posted.json()).toMatchObject({
    method: 'POST',
    body: 'payload',
  });
  expect(control.held).toBe(0);
  expect(control.count('/api/images')).toBe(0);
});

it('adds the suite fixture query only when absent and preserves Request headers', async () => {
  browser.__motionReadControl.restore();
  installReadControl({ path: '/api/albums', q: 'motion-fixture' });
  const request = new Request(`${origin}/api/albums`, {
    headers: { authorization: 'test-session' },
  });
  expect(await (await browser.fetch(request)).json()).toMatchObject({
    url: '/api/albums?q=motion-fixture',
    authorization: 'test-session',
  });
  expect(
    await (await browser.fetch(`${origin}/api/albums?q=owner-search`)).json(),
  ).toMatchObject({ url: '/api/albums?q=owner-search' });
  expect(
    await (await browser.fetch(`${origin}/api/other`)).json(),
  ).toMatchObject({ url: '/api/other' });
});

it('restores fetch and releases every concurrently held response', async () => {
  const control = browser.__motionReadControl;
  control.pause(['/api/images', '/api/albums']);
  const images = browser.fetch(`${origin}/api/images`);
  const albums = browser.fetch(`${origin}/api/albums`);
  await vi.waitFor(() => expect(control.held).toBe(2));
  control.restore();
  expect(browser.fetch).toBe(original);
  expect(control.held).toBe(0);
  expect(await (await images).json()).toMatchObject({ url: '/api/images' });
  expect(await (await albums).json()).toMatchObject({ url: '/api/albums' });
});

it.each(['init', 'Request'])(
  'rejects an aborted held response with its %s signal and removes it from the held count',
  async (kind) => {
    const control = browser.__motionReadControl;
    control.pause(['/api/images']);
    const controller = new AbortController();
    const url = `${origin}/api/images`;
    const pending =
      kind === 'Request'
        ? browser.fetch(new Request(url, { signal: controller.signal }))
        : browser.fetch(url, { signal: controller.signal });
    const reason = new Error('Owner cancelled the query');
    const rejected = expect(pending).rejects.toBe(reason);
    await vi.waitFor(() => expect(control.held).toBe(1));
    controller.abort(reason);
    await rejected;
    expect(control.held).toBe(0);
    control.release();
  },
);

it('does not hold an in-flight response that arrives after restore', async () => {
  const control = browser.__motionReadControl;
  control.pause(['/api/images']);
  const pending = browser.fetch(`${origin}/api/images?wait=1`);
  await vi.waitFor(() => expect(delayed).toHaveLength(1));
  control.restore();
  delayed.shift()!();
  expect(await (await pending).json()).toMatchObject({
    url: '/api/images?wait=1',
  });
  expect(control.held).toBe(0);
});
