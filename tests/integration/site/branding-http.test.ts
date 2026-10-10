import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { email, password } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

type Kind = 'logo' | 'favicon';
const fixtures = resolve('tests/fixtures/media-formats');
const maxBytes = 5 * 1024 * 1024;
let directory: string;
let dataDir: string;
let brandingDir: string;
let server: Awaited<ReturnType<typeof launch>> | undefined;
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
let environment: Record<string, string | undefined>;
let origin: string;
let cookie: string;
let token: string;

function request(path: string, init: RequestInit = {}) {
  return fetch(new URL(path, origin), {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
}

function form(bytes: Uint8Array, name = 'misleading.html', mime = 'text/html') {
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), name);
  return body;
}

function upload(kind: Kind, body: FormData) {
  return request(`/api/settings/site/branding/${kind}`, {
    method: 'PUT',
    headers: { cookie, origin },
    body,
  });
}

function remove(kind: Kind) {
  return request(`/api/settings/site/branding/${kind}`, {
    method: 'DELETE',
    headers: { cookie, origin },
  });
}

const readSettings = () =>
  request('/api/settings/site', { headers: { cookie } });

function svg(content = '<rect width="32" height="32" fill="red"/>') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${content}</svg>`;
}

function sizedSvg(size: number) {
  const prefix =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><!--';
  const suffix = '--><rect width="32" height="32" fill="red"/></svg>';
  return Buffer.from(
    prefix + 'x'.repeat(size - prefix.length - suffix.length) + suffix,
  );
}

async function start(port?: number) {
  server = await launch(resolve('.next/standalone'), directory, {
    ...environment,
    ...(port === undefined ? {} : { PORT: String(port) }),
  });
  origin = `http://127.0.0.1:${server.port}`;
  await vi.waitFor(
    async () => {
      expect(server!.child.exitCode, server!.logs()).toBeNull();
      expect((await request('/api/health')).status).toBe(200);
    },
    { timeout: 15000 },
  );
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-site-branding-http-'));
  dataDir = join(directory, 'data');
  brandingDir = join(dataDir, 'assets/branding');
  environment = {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  await start();
  const entries = server!
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
  expect(entries).toHaveLength(1);
  const setup = await request('/api/setup', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      code: entries[0].code,
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

it('品牌写入只接受所有者 Cookie 和站点来源，认证在 multipart 解析前完成', async () => {
  for (const kind of ['logo', 'favicon'] as const) {
    for (const method of ['PUT', 'DELETE']) {
      for (const headers of [
        {},
        { authorization: `Bearer ${token}` },
        { cookie: `ariso.share_token=${token}` },
      ] as Record<string, string>[]) {
        const response = await request(`/api/settings/site/branding/${kind}`, {
          method,
          headers: { ...headers, origin },
          ...(method === 'PUT' ? { body: 'malformed multipart' } : {}),
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
      }
      for (const headers of [
        { cookie },
        { cookie, origin: 'https://foreign.example' },
      ] as Record<string, string>[]) {
        const response = await request(`/api/settings/site/branding/${kind}`, {
          method,
          headers,
          ...(method === 'PUT' ? { body: 'malformed multipart' } : {}),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      }
    }
  }
  const settings = await readSettings();
  expect(settings.headers.get('cache-control')).toBe('no-store');
  expect(await settings.json()).toMatchObject({
    logoUrl: null,
    faviconUrl: null,
  });
  expect(await readdir(brandingDir)).toEqual([]);
});

it('按真实内容接受允许格式，匿名读取返回原始字节及确认后的 MIME，SVG 使用图片隔离头', async () => {
  for (const [kind, file, mime] of [
    ['logo', 'source.png', 'image/png'],
    ['logo', 'static.jpg', 'image/jpeg'],
    ['logo', 'static.webp', 'image/webp'],
    ['logo', 'static.svg', 'image/svg+xml'],
    ['favicon', 'source.png', 'image/png'],
    ['favicon', 'multiple.ico', 'image/x-icon'],
    ['favicon', 'static.svg', 'image/svg+xml'],
  ] as const) {
    const bytes = await readFile(join(fixtures, file));
    const saved = await upload(kind, form(bytes));
    expect(saved.status, await saved.clone().text()).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    const asset = await saved.json();
    expect(asset).toMatchObject({ url: expect.any(String), mime });
    expect(new URL(asset.url, origin).pathname).toMatch(/^\/branding\/[^/]+$/);
    const response = await request(asset.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(mime);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    if (mime === 'image/svg+xml') {
      expect(response.headers.get('content-disposition')).toMatch(
        /^attachment/,
      );
      expect(response.headers.get('content-security-policy')).toContain(
        "default-src 'none'",
      );
      expect(response.headers.get('content-security-policy')).toContain(
        'sandbox',
      );
    }
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(await (await readSettings()).json()).toMatchObject({
      [`${kind}Url`]: asset.url,
      [`${kind}Mime`]: mime,
    });
  }
}, 30000);

it('损坏、动态、外部引用及用途不支持的格式返回明确错误并保留旧素材', async () => {
  const png = await readFile(join(fixtures, 'source.png'));
  const seeded = await upload('logo', form(png));
  expect(seeded.status).toBe(200);
  const previous = await seeded.json();
  const before = await (await readSettings()).json();
  const rejected: Array<[Kind, Uint8Array, number, string]> = [
    [
      'logo',
      await readFile(join(fixtures, 'multiple.ico')),
      415,
      'SITE_ASSET_TYPE_UNSUPPORTED',
    ],
    [
      'favicon',
      await readFile(join(fixtures, 'static.jpg')),
      415,
      'SITE_ASSET_TYPE_UNSUPPORTED',
    ],
    [
      'favicon',
      await readFile(join(fixtures, 'static.webp')),
      415,
      'SITE_ASSET_TYPE_UNSUPPORTED',
    ],
    [
      'logo',
      await readFile(join(fixtures, 'static.gif')),
      415,
      'SITE_ASSET_TYPE_UNSUPPORTED',
    ],
    [
      'logo',
      png.subarray(0, Math.floor(png.length / 2)),
      400,
      'SITE_ASSET_INVALID',
    ],
    ['logo', Buffer.from([0, 1, 2, 3]), 400, 'SITE_ASSET_INVALID'],
    [
      'logo',
      await readFile(join(fixtures, 'animated.png')),
      400,
      'SITE_ASSET_INVALID',
    ],
    [
      'logo',
      await readFile(join(fixtures, 'animated.webp')),
      400,
      'SITE_ASSET_INVALID',
    ],
    ...[
      '<script>alert(1)</script>',
      '<rect onload="alert(1)"/>',
      '<animate attributeName="fill" values="red;blue"/>',
      '<set attributeName="fill" to="red"/>',
      '<style>@keyframes move { from { opacity: 0 } to { opacity: 1 } }</style>',
      '<rect style="animation:move 1s infinite"/>',
      '<image href="https://example.invalid/canary"/>',
      '<image href="file:///etc/passwd"/>',
      '<rect>',
    ].map(
      (content) =>
        ['logo', Buffer.from(svg(content)), 400, 'SITE_ASSET_INVALID'] as [
          Kind,
          Uint8Array,
          number,
          string,
        ],
    ),
  ];
  for (const [kind, bytes, status, code] of rejected) {
    const failed = await upload(kind, form(bytes));
    expect(failed.status, await failed.clone().text()).toBe(status);
    expect(await failed.json()).toMatchObject({ code });
    expect(await (await readSettings()).json()).toEqual(before);
  }
  const readable = await request(previous.url);
  expect(readable.status).toBe(200);
  expect(Buffer.from(await readable.arrayBuffer())).toEqual(png);
  expect(await readdir(brandingDir)).toEqual([basename(previous.url)]);
}, 30000);

it('multipart 只允许单个 file，拒绝缺失、重复、额外、空文件和损坏请求', async () => {
  const png = await readFile(join(fixtures, 'source.png'));
  const repeated = form(png);
  repeated.append('file', new Blob([new Uint8Array(png)]), 'second.png');
  const extra = form(png);
  extra.append('path', '/tmp/arbitrary');
  const wrong = new FormData();
  wrong.append('logo', new Blob([new Uint8Array(png)]), 'wrong.png');
  const textFile = new FormData();
  textFile.append('file', 'server-path');
  for (const init of [
    { body: new FormData() },
    { body: repeated },
    { body: extra },
    { body: wrong },
    { body: textFile },
    { body: form(Buffer.alloc(0)) },
    { body: 'plain text', headers: { 'content-type': 'text/plain' } },
    {
      body: '--broken',
      headers: { 'content-type': 'multipart/form-data; boundary=broken' },
    },
  ]) {
    const response = await request('/api/settings/site/branding/logo', {
      ...init,
      method: 'PUT',
      headers: { cookie, origin, ...init.headers },
    });
    expect(response.status, await response.clone().text()).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'SITE_ASSET_INVALID' });
  }
  expect(await (await readSettings()).json()).toMatchObject({ logoUrl: null });
  expect(await readdir(brandingDir)).toEqual([]);
});

it.each(['logo', 'favicon'] as const)(
  '真实上传 %s 接受 5 MiB 少一字节与精确上限，拒绝多一字节并保留当前引用',
  async (kind) => {
    const below = sizedSvg(maxBytes - 1);
    expect(below.length).toBe(maxBytes - 1);
    const belowResponse = await upload(kind, form(below));
    expect(belowResponse.status, await belowResponse.clone().text()).toBe(200);
    const belowAsset = await belowResponse.json();
    const belowRead = await request(belowAsset.url);
    expect(belowRead.status).toBe(200);
    expect((await belowRead.arrayBuffer()).byteLength).toBe(maxBytes - 1);
    const exact = sizedSvg(maxBytes);
    expect(exact.length).toBe(maxBytes);
    const success = await upload(kind, form(exact));
    expect(success.status, await success.clone().text()).toBe(200);
    const asset = await success.json();
    const before = await (await readSettings()).json();
    const failed = await upload(kind, form(sizedSvg(maxBytes + 1)));
    expect(failed.status).toBe(413);
    expect(await failed.json()).toMatchObject({ code: 'SITE_ASSET_TOO_LARGE' });
    expect(await (await readSettings()).json()).toEqual(before);
    const response = await request(asset.url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(exact);
  },
  30000,
);

it('chunked 超限上传返回 413，保留当前素材并释放接收临时文件', async () => {
  const png = await readFile(join(fixtures, 'source.png'));
  const seeded = await upload('logo', form(png));
  expect(seeded.status).toBe(200);
  const previous = await seeded.json();
  const boundary = 'ariso-brand-production-chunked';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`,
  );
  const bytes = sizedSvg(maxBytes + 1024 * 1024);
  let offset = -1;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset === -1) {
          controller.enqueue(header);
          offset = 0;
        } else if (offset < bytes.length) {
          controller.enqueue(bytes.subarray(offset, offset + 64 * 1024));
          offset += 64 * 1024;
        } else {
          controller.enqueue(Buffer.from(`\r\n--${boundary}--\r\n`));
          controller.close();
        }
      },
    },
    { highWaterMark: 0 },
  );
  const response = await request('/api/settings/site/branding/logo', {
    method: 'PUT',
    headers: {
      cookie,
      origin,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ code: 'SITE_ASSET_TOO_LARGE' });
  expect(
    Buffer.from(await (await request(previous.url)).arrayBuffer()),
  ).toEqual(png);
  expect(await readdir(brandingDir)).toEqual([basename(previous.url)]);
});

it('替换与删除只改变所选用途，旧 URL 停止服务，重复删除成功，素材不进入图库或访问计数', async () => {
  const png = await readFile(join(fixtures, 'source.png'));
  const first = await (await upload('logo', form(png))).json();
  const favicon = await (await upload('favicon', form(png))).json();
  const secondResponse = await upload('logo', form(Buffer.from(svg())));
  expect(secondResponse.status).toBe(200);
  const second = await secondResponse.json();
  expect(second.url).not.toBe(first.url);
  expect((await request(first.url)).status).toBe(404);
  expect((await request(second.url)).status).toBe(200);
  expect((await request(favicon.url)).status).toBe(200);
  expect(await (await readSettings()).json()).toMatchObject({
    logoUrl: second.url,
    faviconUrl: favicon.url,
  });
  for (const kind of ['logo', 'favicon'] as const) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await remove(kind);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ url: null, mime: null });
    }
    expect(
      (await request(kind === 'logo' ? second.url : favicon.url)).status,
    ).toBe(404);
  }
  expect(await readdir(brandingDir)).toEqual([]);
  for (const table of [
    'media_images',
    'media_objects',
    'analytics_daily',
    'analytics_image_daily',
    'analytics_image_totals',
  ]) {
    expect(
      connection!.db.$client
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get(),
    ).toEqual({ count: 0 });
  }
});

it('数据库提交失败时 PUT/DELETE 返回 500 并保持之前的引用和文件', async () => {
  const png = await readFile(join(fixtures, 'source.png'));
  const seeded = await upload('logo', form(png));
  expect(seeded.status).toBe(200);
  const previous = await seeded.json();
  const before = await (await readSettings()).json();
  connection!.db.$client.exec(
    "CREATE TRIGGER reject_branding BEFORE UPDATE ON site_settings BEGIN SELECT RAISE(ABORT, 'branding write failed'); END",
  );
  try {
    for (const response of [
      await upload('logo', form(Buffer.from(svg()))),
      await remove('logo'),
    ]) {
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        code: 'SITE_INTERNAL_ERROR',
      });
    }
    expect(await (await readSettings()).json()).toEqual(before);
    const response = await request(previous.url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(await readdir(brandingDir)).toEqual([basename(previous.url)]);
  } finally {
    connection!.db.$client.exec('DROP TRIGGER reject_branding');
  }
});

it('匿名读取只服务当前引用，缺失当前文件返回明确 500 并保留路径诊断', async () => {
  const response = await upload('logo', form(Buffer.from(svg())));
  expect(response.status).toBe(200);
  const asset = await response.json();
  await writeFile(join(brandingDir, 'private-note.txt'), 'not a brand asset');
  for (const path of [
    '/branding/private-note.txt',
    '/branding/unknown.svg',
    '/branding/%2e%2e%2fariso.db',
  ]) {
    expect((await request(path)).status, path).toBe(404);
  }
  const directoryResponse = await request('/branding/');
  expect(directoryResponse.status).toBe(308);
  expect(directoryResponse.headers.get('location')).toBe('/branding');
  expect((await request('/branding')).status).toBe(404);
  const path = join(brandingDir, basename(asset.url));
  await rm(path);
  const missing = await request(asset.url);
  expect(missing.status).toBe(500);
  expect(missing.headers.get('cache-control')).toBe('no-store');
  expect(await missing.json()).toMatchObject({ code: 'SITE_ASSET_MISSING' });
  expect(server!.logs()).toContain(path);
  expect(connection!.db.select().from(siteSettings).get()?.logoKey).toBe(
    basename(asset.url),
  );
});

it('站点名称、描述与图标在新请求中即时更新，删除图标后移除自定义图标', async () => {
  const updated = await request('/api/settings/site', {
    method: 'PATCH',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'HTTP 品牌站点',
      description: '品牌描述 <b>普通文本</b>',
    }),
  });
  expect(updated.status).toBe(200);
  const icon = await upload(
    'favicon',
    form(await readFile(join(fixtures, 'source.png'))),
  );
  expect(icon.status).toBe(200);
  const first = await icon.json();
  for (const path of ['/', '/login']) {
    const page = await request(path);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<title>HTTP 品牌站点</title>');
    expect(html).toContain('content="品牌描述 &lt;b&gt;普通文本&lt;/b&gt;"');
    expect(html).toMatch(
      new RegExp(`<link[^>]+rel="icon"[^>]+href="${first.url}"`),
    );
  }
  const replaced = await upload('favicon', form(Buffer.from(svg())));
  expect(replaced.status).toBe(200);
  const second = await replaced.json();
  const changed = await (await request('/')).text();
  expect(changed).toMatch(
    new RegExp(`<link[^>]+rel="icon"[^>]+href="${second.url}"`),
  );
  expect(changed).not.toContain(`href="${first.url}"`);
  expect((await remove('favicon')).status).toBe(200);
  const restored = await (await request('/')).text();
  expect(restored).not.toContain(`href="${second.url}"`);
  expect(restored).not.toMatch(/<link[^>]+rel="icon"[^>]+href="\/branding\//);
});

it('重启保持当前品牌引用且只清理 site 自有孤立文件', async () => {
  const png = await readFile(join(fixtures, 'source.png'));
  const previous = await (await upload('logo', form(png))).json();
  const currentResponse = await upload('logo', form(Buffer.from(svg())));
  expect(currentResponse.status).toBe(200);
  const current = await currentResponse.json();
  const favicon = await (await upload('favicon', form(png))).json();
  const before = await (await readSettings()).json();
  const port = server!.port;
  await stop(server!.child, server!.closed);
  server = undefined;
  await writeFile(join(brandingDir, basename(previous.url)), png);
  await writeFile(join(brandingDir, 'operator-note.txt'), 'keep this');
  await writeFile(
    join(dataDir, 'assets/operator-note.txt'),
    'keep outside branding',
  );
  await start(port);
  expect(await (await readSettings()).json()).toEqual(before);
  expect((await request(current.url)).status).toBe(200);
  expect((await request(favicon.url)).status).toBe(200);
  expect((await request(previous.url)).status).toBe(404);
  expect((await readdir(brandingDir)).sort()).toEqual(
    [basename(current.url), basename(favicon.url), 'operator-note.txt'].sort(),
  );
  expect(
    await readFile(join(dataDir, 'assets/operator-note.txt'), 'utf8'),
  ).toBe('keep outside branding');
}, 30000);
