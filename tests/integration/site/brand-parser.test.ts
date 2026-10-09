import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BRAND_MAX_BYTES,
  receiveBrandFile,
  startBrandFixture,
  validateBrandFile,
} from '../../experiments/site-branding/lab.ts';

type Kind = 'logo' | 'favicon';
const fixtures = resolve('tests/fixtures/media-formats');
const accepted = [
  ['logo', 'source.png', 'PNG', 'image/png', 'png'],
  ['logo', 'static.jpg', 'JPEG', 'image/jpeg', 'jpg'],
  ['logo', 'static.webp', 'WEBP', 'image/webp', 'webp'],
  ['logo', 'static.svg', 'SVG', 'image/svg+xml', 'svg'],
  ['favicon', 'source.png', 'PNG', 'image/png', 'png'],
  ['favicon', 'multiple.ico', 'ICO', 'image/x-icon', 'ico'],
  ['favicon', 'static.svg', 'SVG', 'image/svg+xml', 'svg'],
] as const;
const unsupported = [
  ['logo', 'multiple.ico'],
  ['favicon', 'static.jpg'],
  ['favicon', 'static.webp'],
  ['logo', 'static.gif'],
  ['favicon', 'static.gif'],
] as const;
const invalidSvg = [
  ['script', '<script>alert(1)</script>'],
  ['event', '<rect onload="alert(1)"/>'],
  ['SMIL animate', '<animate attributeName="fill" values="red;blue"/>'],
  ['SMIL set', '<set attributeName="fill" to="red"/>'],
  [
    'CSS keyframes',
    '<style>@keyframes move { from { opacity: 0 } to { opacity: 1 } }</style>',
  ],
  ['CSS animation', '<rect style="animation:move 1s infinite"/>'],
  ['CSS transition', '<rect style="transition:fill 1s"/>'],
  ['external https image', '<image href="https://example.invalid/canary"/>'],
  ['external file image', '<image href="file:///etc/passwd"/>'],
  [
    'external CSS resource',
    '<style>rect { fill: url(https://example.invalid/canary) }</style><rect width="32" height="32"/>',
  ],
  ['malformed XML', '<rect>'],
] as const;

let directory: string;
let workspace: string;
let fixture: Awaited<ReturnType<typeof startBrandFixture>> | undefined;
const httpEvidence: Array<{
  case: string;
  status: number;
  headers: Record<string, string | null>;
  body: unknown;
}> = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-site-brand-parser-'));
  workspace = join(directory, 'tools');
  await mkdir(workspace);
});

afterEach(async () => {
  try {
    await fixture?.close();
  } finally {
    fixture = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

afterAll(async () => {
  if (!process.env.BRAND_REPORT_DIR) return;
  await mkdir(process.env.BRAND_REPORT_DIR, { recursive: true });
  await writeFile(
    join(process.env.BRAND_REPORT_DIR, 'http.json'),
    `${JSON.stringify(httpEvidence, null, 2)}\n`,
  );
});

// Original inert geometric SVG artwork, dedicated to CC0 like the fixtures.
function svg(body = '<rect width="32" height="32" fill="red"/>') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${body}</svg>`;
}

function sizedSvg(bytes: number) {
  const prefix =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><!--';
  const suffix = '--><rect width="32" height="32" fill="red"/></svg>';
  const result = Buffer.from(
    prefix + 'x'.repeat(bytes - prefix.length - suffix.length) + suffix,
  );
  expect(result.length).toBe(bytes);
  return result;
}

function validate(
  path: string,
  kind: Kind = 'logo',
  signal = new AbortController().signal,
) {
  return validateBrandFile(path, workspace, kind, signal);
}

function form(bytes: Uint8Array, name = 'misleading.html', mime = 'text/html') {
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), name);
  return body;
}

async function request(caseName: string, path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, fixture!.origin), {
    ...init,
    signal: AbortSignal.timeout(15_000),
    redirect: 'manual',
  });
  const copy = response.clone();
  const body = response.headers
    .get('content-type')
    ?.startsWith('application/json')
    ? await copy.json()
    : { byteLength: (await copy.arrayBuffer()).byteLength };
  httpEvidence.push({
    case: caseName,
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type'),
      'content-disposition': response.headers.get('content-disposition'),
      csp: response.headers.get('content-security-policy'),
      nosniff: response.headers.get('x-content-type-options'),
    },
    body,
  });
  return response;
}

async function upload(caseName: string, kind: Kind, body: FormData) {
  return request(caseName, `/branding/${kind}`, { method: 'PUT', body });
}

describe('EV-SITE-01 content-based brand parser', () => {
  it.each(accepted)(
    'accepts %s %s by real content without changing bytes',
    async (kind, file, format, mime, extension) => {
      const source = join(directory, 'wrong-extension.html');
      await copyFile(join(fixtures, file), source);
      const bytes = await readFile(source);
      expect(await validate(source, kind)).toMatchObject({
        format,
        mime,
        extension,
        width: 64,
        height: format === 'ICO' ? 64 : 48,
      });
      expect(await readFile(source)).toEqual(bytes);
    },
  );

  it.each(unsupported)(
    'rejects disallowed %s %s distinctly from corrupt content',
    async (kind, file) => {
      await expect(validate(join(fixtures, file), kind)).rejects.toMatchObject({
        code: 'SITE_ASSET_TYPE_UNSUPPORTED',
      });
    },
  );

  it.each(['source.png', 'static.jpg', 'static.webp', 'multiple.ico'])(
    'rejects corrupt %s despite recognizable signatures',
    async (file) => {
      const bytes = await readFile(join(fixtures, file));
      const source = join(directory, 'truncated');
      await writeFile(source, bytes.subarray(0, Math.floor(bytes.length / 2)));
      await expect(
        validate(source, file.endsWith('.ico') ? 'favicon' : 'logo'),
      ).rejects.toMatchObject({
        code: 'SITE_ASSET_INVALID',
      });
    },
  );

  it.each(invalidSvg)(
    'rejects SVG %s without modifying the input',
    async (_label, content) => {
      const source = join(directory, 'input.svg');
      const bytes = svg(content);
      await writeFile(source, bytes);
      await expect(validate(source)).rejects.toMatchObject({
        code: 'SITE_ASSET_INVALID',
      });
      expect(await readFile(source, 'utf8')).toBe(bytes);
    },
  );

  it('accepts static SVG internal gradient and use references', async () => {
    const source = join(directory, 'internal.svg');
    await writeFile(
      source,
      svg(
        '<defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient><rect id="shape" width="32" height="32" fill="url(#paint)"/></defs><use href="#shape"/>',
      ),
    );
    expect(await validate(source)).toMatchObject({
      format: 'SVG',
      width: 32,
      height: 32,
    });
  });

  it('derives SVG dimensions from viewBox with no explicit size', async () => {
    const source = join(directory, 'viewbox.svg');
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="red"/></svg>',
    );
    expect(await validate(source)).toMatchObject({
      format: 'SVG',
      width: 100,
      height: 50,
    });
  });

  it.each(['animated.png', 'animated.webp'])(
    'rejects animated raster %s',
    async (file) => {
      await expect(validate(join(fixtures, file))).rejects.toMatchObject({
        code: 'SITE_ASSET_INVALID',
      });
    },
  );

  it('preserves an already cancelled operation as cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = validate(
      join(fixtures, 'source.png'),
      'logo',
      controller.signal,
    );
    await expect(result).rejects.toBeDefined();
    await expect(result).rejects.not.toMatchObject({
      code: 'SITE_ASSET_INVALID',
    });
  });

  it('keeps missing-file diagnostics distinct from malformed content', async () => {
    const result = validate(join(directory, 'missing.svg'));
    await expect(result).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('EV-SITE-01 loopback brand HTTP fixture', () => {
  it.each(unsupported)(
    'reports HTTP 415 for disallowed %s %s',
    async (kind, file) => {
      fixture = await startBrandFixture(join(directory, 'http'));
      const response = await upload(
        `unsupported ${kind} ${file}`,
        kind,
        form(await readFile(join(fixtures, file))),
      );
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({
        code: 'SITE_ASSET_TYPE_UNSUPPORTED',
      });
      expect(fixture.readCurrent(kind)).toBeNull();
    },
  );

  it.each(['source.png', 'static.jpg', 'static.webp', 'multiple.ico'])(
    'reports HTTP 400 for damaged %s',
    async (file) => {
      fixture = await startBrandFixture(join(directory, 'http'));
      const bytes = await readFile(join(fixtures, file));
      const kind = file.endsWith('.ico') ? 'favicon' : 'logo';
      const response = await upload(
        `damaged ${file}`,
        kind,
        form(bytes.subarray(0, Math.floor(bytes.length / 2))),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'SITE_ASSET_INVALID',
      });
      expect(fixture.readCurrent(kind)).toBeNull();
    },
  );

  it('does not fetch an SVG external resource from a real canary server', async () => {
    fixture = await startBrandFixture(join(directory, 'http'));
    const canaryRequests: string[] = [];
    const canary = createServer((incoming, response) => {
      canaryRequests.push(incoming.url!);
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end(svg());
    });
    await new Promise<void>((resolve) =>
      canary.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = canary.address() as import('node:net').AddressInfo;
      const response = await upload(
        'SVG external loopback canary',
        'logo',
        form(
          Buffer.from(
            svg(`<image href="http://127.0.0.1:${address.port}/canary.svg"/>`),
          ),
        ),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'SITE_ASSET_INVALID',
      });
      expect(canaryRequests).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        canary.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each(accepted)(
    'uploads and serves %s %s using detected MIME despite client claims',
    async (kind, file, format, mime) => {
      fixture = await startBrandFixture(join(directory, 'http'));
      const bytes = await readFile(join(fixtures, file));
      const response = await upload(
        `accept ${kind} ${file}`,
        kind,
        form(bytes),
      );
      expect(response.status, await response.clone().text()).toBe(200);
      const asset = await response.json();
      expect(asset).toMatchObject({
        url: expect.any(String),
        mime,
        format,
        bytes: bytes.length,
      });
      const current = fixture.readCurrent(kind);
      expect(current).toMatchObject({ mime });
      expect(new URL(asset.url, fixture.origin).pathname).toBe(
        `/branding/${current!.key}`,
      );
      const read = await request(`read ${kind} ${file}`, asset.url);
      expect(read.status).toBe(200);
      expect(read.headers.get('content-type')).toBe(mime);
      expect(read.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await read.arrayBuffer()).toEqual(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
    },
  );

  it.each(['logo', 'favicon'] as const)(
    'enforces exact 5 MiB file-byte boundary for %s over real HTTP',
    async (kind) => {
      fixture = await startBrandFixture(join(directory, 'http'));
      expect(BRAND_MAX_BYTES).toBe(5 * 1024 * 1024);
      for (const delta of [-1, 0, 1]) {
        const size = BRAND_MAX_BYTES + delta;
        const before = fixture.readCurrent(kind);
        const response = await upload(
          `${kind} 5MiB ${delta >= 0 ? '+' : ''}${delta}`,
          kind,
          form(sizedSvg(size)),
        );
        expect(response.status, await response.clone().text()).toBe(
          delta === 1 ? 413 : 200,
        );
        if (delta === 1) {
          expect(await response.json()).toMatchObject({
            code: 'SITE_ASSET_TOO_LARGE',
          });
          expect(fixture.readCurrent(kind)).toEqual(before);
          expect(
            (
              await request(
                `old ${kind} after oversized`,
                `/branding/${before!.key}`,
              )
            ).status,
          ).toBe(200);
        } else {
          expect(await response.json()).toMatchObject({
            mime: 'image/svg+xml',
            format: 'SVG',
            bytes: size,
          });
        }
      }
    },
    30_000,
  );

  it('returns HTTP 413 for a chunked oversized upload while preserving the old asset and cleaning the request workspace', async () => {
    const root = join(directory, 'http');
    fixture = await startBrandFixture(root);
    const png = await readFile(join(fixtures, 'source.png'));
    const seed = await upload('chunked overflow seed', 'logo', form(png));
    expect(seed.status).toBe(200);
    const old = await seed.json();
    const oldReference = fixture.readCurrent('logo');
    const boundary = 'ariso-real-chunked-brand';
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oversized.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`,
    );
    const bytes = sizedSvg(BRAND_MAX_BYTES + 1024 * 1024);
    let offset = -1;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(source) {
          if (offset === -1) {
            source.enqueue(header);
            offset = 0;
          } else if (offset < bytes.length) {
            source.enqueue(bytes.subarray(offset, offset + 64 * 1024));
            offset += 64 * 1024;
          } else {
            source.enqueue(Buffer.from(`\r\n--${boundary}--\r\n`));
            source.close();
          }
        },
      },
      { highWaterMark: 0 },
    );
    // An unknown-length stream makes fetch use actual HTTP chunked transfer.
    const response = await request(
      'chunked oversized upload',
      '/branding/logo',
      {
        method: 'PUT',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body: stream,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: 'SITE_ASSET_TOO_LARGE',
    });
    expect(fixture.readCurrent('logo')).toEqual(oldReference);
    const read = await request('previous logo after chunked overflow', old.url);
    expect(read.status).toBe(200);
    expect(Buffer.from(await read.arrayBuffer())).toEqual(png);
    expect(
      (await readdir(root)).filter((name) => name.startsWith('request-')),
    ).toEqual([]);
  });

  it('retains the previous readable reference after unsupported, damaged and active input', async () => {
    fixture = await startBrandFixture(join(directory, 'http'));
    const png = await readFile(join(fixtures, 'source.png'));
    const seed = await upload('seed previous logo', 'logo', form(png));
    expect(seed.status).toBe(200);
    const old = await seed.json();
    const oldReference = fixture.readCurrent('logo');
    const rejected: Array<[string, Uint8Array, number, string]> = [
      [
        'unsupported ICO logo',
        await readFile(join(fixtures, 'multiple.ico')),
        415,
        'SITE_ASSET_TYPE_UNSUPPORTED',
      ],
      [
        'corrupt PNG',
        png.subarray(0, Math.floor(png.length / 2)),
        400,
        'SITE_ASSET_INVALID',
      ],
      ['non-image bytes', Buffer.from([0, 1, 2, 3]), 400, 'SITE_ASSET_INVALID'],
      ...invalidSvg.map(
        ([label, content]) =>
          [
            `SVG ${label}`,
            Buffer.from(svg(content)),
            400,
            'SITE_ASSET_INVALID',
          ] as [string, Uint8Array, number, string],
      ),
    ];
    for (const [label, bytes, status, code] of rejected) {
      const response = await upload(label, 'logo', form(bytes));
      expect(response.status, await response.clone().text()).toBe(status);
      expect(await response.json()).toMatchObject({ code });
      expect(fixture.readCurrent('logo')).toEqual(oldReference);
      const read = await request(`previous logo after ${label}`, old.url);
      expect(read.status).toBe(200);
      expect(Buffer.from(await read.arrayBuffer())).toEqual(png);
    }
  }, 30_000);

  it('replaces only the selected kind and stops serving the old version URL', async () => {
    fixture = await startBrandFixture(join(directory, 'http'));
    const png = await readFile(join(fixtures, 'source.png'));
    const first = await (await upload('first logo', 'logo', form(png))).json();
    const favicon = await (
      await upload('independent favicon', 'favicon', form(png))
    ).json();
    const faviconReference = fixture.readCurrent('favicon');
    const replacement = await upload(
      'replace logo',
      'logo',
      form(await readFile(join(fixtures, 'static.svg'))),
    );
    expect(replacement.status).toBe(200);
    const second = await replacement.json();
    expect(second.url).not.toBe(first.url);
    expect(
      (await request('old logo after successful replacement', first.url))
        .status,
    ).toBe(404);
    expect(
      (await request('new logo after successful replacement', second.url))
        .status,
    ).toBe(200);
    expect(fixture.readCurrent('favicon')).toEqual(faviconReference);
    expect(
      (await request('favicon unaffected by logo replacement', favicon.url))
        .status,
    ).toBe(200);
  });

  it.each(['beforeWrite', 'beforeCommit'] as const)(
    'preserves previous reference on %s failure and reports the failure',
    async (stage) => {
      let fail = false;
      fixture = await startBrandFixture(join(directory, 'http'), {
        [stage]: async () => {
          if (fail) throw new Error(`injected ${stage} failure`);
        },
      });
      const png = await readFile(join(fixtures, 'source.png'));
      const seed = await upload(`${stage} seed`, 'logo', form(png));
      expect(seed.status).toBe(200);
      const old = await seed.json();
      const oldReference = fixture.readCurrent('logo');
      fail = true;
      const failed = await upload(
        `${stage} injected failure`,
        'logo',
        form(await readFile(join(fixtures, 'static.svg'))),
      );
      expect(failed.status).toBe(500);
      expect(await failed.json()).toMatchObject({
        code: 'SITE_ASSET_IO_FAILED',
      });
      expect(
        fixture.diagnostics.some((message) =>
          message.includes(`injected ${stage} failure`),
        ),
      ).toBe(true);
      expect(fixture.readCurrent('logo')).toEqual(oldReference);
      const read = await request(
        `${stage} previous asset remains readable`,
        old.url,
      );
      expect(read.status).toBe(200);
      expect(Buffer.from(await read.arrayBuffer())).toEqual(png);
    },
  );

  it('waits for an interrupted beforeCommit handler on shutdown and preserves the previous reference', async () => {
    const root = join(directory, 'http');
    let blockCommit = false;
    let entered!: () => void;
    let release!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture = await startBrandFixture(root, {
      beforeCommit: async () => {
        if (!blockCommit) return;
        entered();
        await commitGate;
      },
    });
    const png = await readFile(join(fixtures, 'source.png'));
    const seed = await upload('shutdown previous logo seed', 'logo', form(png));
    expect(seed.status).toBe(200);
    const oldReference = fixture.readCurrent('logo');
    blockCommit = true;
    const pending = upload(
      'shutdown interrupted replacement',
      'logo',
      form(await readFile(join(fixtures, 'static.svg'))),
    ).then(
      (response) => ({ response, error: undefined }),
      (error: unknown) => ({ response: undefined, error }),
    );
    let closing: Promise<void> | undefined;
    let closed = false;
    try {
      await atCommit;
      // The new file exists, while the reference still points to the old PNG.
      expect(
        (await readdir(root)).filter((name) => !name.startsWith('request-')),
      ).toHaveLength(2);
      closing = fixture.close().then(() => {
        closed = true;
      });
      const outcome = await pending;
      expect(outcome.response).toBeUndefined();
      expect(outcome.error).toBeInstanceOf(TypeError);
      // The socket has closed; close() must still wait for the blocked handler.
      expect(closed).toBe(false);
      expect(fixture.readCurrent('logo')).toEqual(oldReference);
      release();
      await closing;
      expect(closed).toBe(true);
      expect(fixture.readCurrent('logo')).toEqual(oldReference);
      expect(await readdir(root)).toEqual([oldReference!.key]);
      expect(await readFile(join(root, oldReference!.key))).toEqual(png);
      expect(
        fixture.diagnostics.some((message) =>
          message.includes('Brand fixture closing'),
        ),
      ).toBe(true);
    } finally {
      release();
      if (closing) {
        await closing;
        fixture = undefined;
      }
    }
  });

  it('rejects malformed multipart, missing, extra and repeated file fields', async () => {
    fixture = await startBrandFixture(join(directory, 'http'));
    const png = await readFile(join(fixtures, 'source.png'));
    const body = form(png);
    body.append('file', new Blob([new Uint8Array(png)]), 'second.png');
    const extra = form(png);
    extra.append('path', '/tmp/arbitrary');
    const requests: Array<[string, RequestInit]> = [
      [
        'not multipart',
        {
          method: 'PUT',
          body: 'not multipart',
          headers: { 'content-type': 'text/plain' },
        },
      ],
      [
        'malformed multipart',
        {
          method: 'PUT',
          body: '--broken',
          headers: { 'content-type': 'multipart/form-data; boundary=broken' },
        },
      ],
      ['missing file', { method: 'PUT', body: new FormData() }],
      ['repeated file', { method: 'PUT', body }],
      ['extra field', { method: 'PUT', body: extra }],
      ['empty file', { method: 'PUT', body: form(Buffer.alloc(0)) }],
    ];
    for (const [label, init] of requests) {
      const response = await request(label, '/branding/logo', init);
      expect(response.status, await response.clone().text()).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'SITE_ASSET_INVALID',
      });
      expect(fixture.readCurrent('logo')).toBeNull();
    }
  });
});

describe('EV-SITE-01 bounded multipart receiver', () => {
  it('stops reading an oversized file before consuming the large remaining tail', async () => {
    const boundary = 'ariso-brand-stream';
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`,
    );
    const chunk = new Uint8Array(64 * 1024);
    let chunksRead = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (chunksRead === 0) controller.enqueue(header);
          else if (chunksRead <= 1024) controller.enqueue(chunk);
          else {
            controller.enqueue(Buffer.from(`\r\n--${boundary}--\r\n`));
            controller.close();
          }
          chunksRead++;
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request('http://127.0.0.1/branding/logo', {
      method: 'PUT',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(
      receiveBrandFile(
        request,
        join(directory, 'streamed'),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'SITE_ASSET_TOO_LARGE' });
    expect(chunksRead).toBeLessThan(100);
    expect(cancelled).toBe(true);
  });

  it('cancels a pending body read and releases the source when interrupted', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(source) {
        source.enqueue(
          Buffer.from(
            '--ariso\r\nContent-Disposition: form-data; name="file"; filename="x.svg"\r\n\r\n',
          ),
        );
        started();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('http://127.0.0.1/branding/logo', {
      method: 'PUT',
      headers: { 'content-type': 'multipart/form-data; boundary=ariso' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const result = receiveBrandFile(
      request,
      join(directory, 'cancelled'),
      controller.signal,
    );
    await reading;
    controller.abort();
    await expect(result).rejects.toBeDefined();
    await expect(result).rejects.not.toMatchObject({
      code: 'SITE_ASSET_INVALID',
    });
    expect(cancelled).toBe(true);
  });
});
