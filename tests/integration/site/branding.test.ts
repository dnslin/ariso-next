import * as fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  createBrandingService,
  type BrandingKind,
} from '../../../src/server/site/branding.ts';
import {
  initializeSiteSettings,
  requireSiteSettings,
} from '../../../src/server/site/settings.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
  };
});

const fixtures = resolve('tests/fixtures/media-formats');
let directory: string;
let root: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let service: ReturnType<typeof createBrandingService>;
let logger: { warn: ReturnType<typeof vi.fn<Logger['warn']>> };
const upload = (kind: BrandingKind = 'logo', fixture = 'source.png') =>
  service.replace(kind, (path) => fs.copyFile(join(fixtures, fixture), path));
const files = () => fs.readdir(root);

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'ariso-branding-'));
  root = join(directory, 'assets', 'branding');
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://example.com',
      timeZone: 'UTC',
    }),
  );
  logger = { warn: vi.fn<Logger['warn']>() };
  service = createBrandingService({
    db: connection.db,
    brandingRoot: root,
    logger,
  });
  await service.ready;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await service.close();
  connection.close();
  await fs.rm(directory, { recursive: true, force: true });
});

describe('品牌文件真实 SQLite 和磁盘生命周期', () => {
  it.each([
    ['logo', 'source.png', 'image/png'],
    ['logo', 'static.jpg', 'image/jpeg'],
    ['logo', 'static.webp', 'image/webp'],
    ['logo', 'static.svg', 'image/svg+xml'],
    ['favicon', 'source.png', 'image/png'],
    ['favicon', 'multiple.ico', 'image/x-icon'],
    ['favicon', 'static.svg', 'image/svg+xml'],
  ] as const)(
    '按内容识别 %s 的 %s，返回确认的 MIME',
    async (kind, fixture, mime) => {
      const asset = await upload(kind, fixture);
      expect(asset.mime).toBe(mime);
      expect((await service.read(asset.key))?.bytes).toEqual(
        await fs.readFile(join(fixtures, fixture)),
      );
      expect(await files()).toEqual([asset.key]);
    },
  );

  it.each([
    ['logo', 'multiple.ico'],
    ['favicon', 'static.jpg'],
    ['favicon', 'static.webp'],
    ['logo', 'static.gif'],
  ] as const)(
    '拒绝 %s 不允许的 %s，不生成引用或文件',
    async (kind, fixture) => {
      await expect(upload(kind, fixture)).rejects.toMatchObject({
        code: 'SITE_ASSET_TYPE_UNSUPPORTED',
        status: 415,
      });
      expect(requireSiteSettings(connection.db)[`${kind}Key`]).toBeNull();
      expect(await files()).toEqual([]);
    },
  );

  it.each(['animated.png', 'animated.webp'])('拒绝动画 %s', async (fixture) => {
    await expect(upload('logo', fixture)).rejects.toMatchObject({
      code: 'SITE_ASSET_INVALID',
      status: 400,
    });
    expect(await files()).toEqual([]);
  });

  it.each([
    '<script>alert(1)</script>',
    '<rect onload="alert(1)"/>',
    '<animate attributeName="fill" values="red;blue"/>',
    '<style>@keyframes move { from { opacity: 0 } to { opacity: 1 } }</style>',
    '<rect style="animation:move 1s infinite"/>',
    '<image href="https://example.invalid/canary"/>',
    '<rect>',
  ])('拒绝不静态或损坏 SVG：%s', async (body) => {
    await expect(
      service.replace('logo', (path) =>
        fs.writeFile(
          path,
          `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${body}</svg>`,
        ),
      ),
    ).rejects.toMatchObject({ code: 'SITE_ASSET_INVALID', status: 400 });
    expect(await files()).toEqual([]);
  });

  it('损坏栅格拒绝；5 MiB 合法 SVG 接受，超限拒绝并保留旧配置', async () => {
    const png = await fs.readFile(join(fixtures, 'source.png'));
    await expect(
      service.replace('logo', (path) =>
        fs.writeFile(path, png.subarray(0, 80)),
      ),
    ).rejects.toMatchObject({ code: 'SITE_ASSET_INVALID', status: 400 });
    const prefix =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><!--';
    const suffix = '--><rect width="32" height="32"/></svg>';
    const svg =
      prefix +
      'x'.repeat(5 * 1024 * 1024 - prefix.length - suffix.length) +
      suffix;
    const asset = await service.replace('logo', (path) =>
      fs.writeFile(path, svg),
    );
    expect((await service.read(asset.key))?.bytes.length).toBe(5 * 1024 * 1024);
    await expect(
      service.replace('logo', (path) => fs.writeFile(path, svg + ' ')),
    ).rejects.toMatchObject({ code: 'SITE_ASSET_TOO_LARGE', status: 413 });
    expect(requireSiteSettings(connection.db).logoKey).toBe(asset.key);
    expect(await files()).toEqual([asset.key]);
  });

  it('首次上传、替换、重复删除仅改本用途，旧 URL 立即失效', async () => {
    const favicon = (await upload('favicon'))!;
    const first = (await upload())!;
    expect(first).toEqual({
      key: expect.stringMatching(/^site-logo-.*\.png$/),
      mime: 'image/png',
    });
    expect((await service.read(first.key))?.bytes).toEqual(
      await fs.readFile(join(fixtures, 'source.png')),
    );
    const next = (await upload('logo', 'static.jpg'))!;
    expect(next.key).not.toBe(first.key);
    expect(await service.read(first.key)).toBeNull();
    expect(await files()).toEqual(
      expect.arrayContaining([next.key, favicon.key]),
    );
    expect(await files()).toHaveLength(2);
    expect(await service.remove('logo')).toBeNull();
    expect(await service.remove('logo')).toBeNull();
    expect(await service.read(next.key)).toBeNull();
    expect(await files()).toEqual([favicon.key]);
    expect(requireSiteSettings(connection.db)).toMatchObject({
      logoKey: null,
      logoMime: null,
      faviconKey: favicon.key,
    });
  });

  it('接收、写入或数据库提交失败保留旧引用及字节，并清候选文件', async () => {
    const first = (await upload())!;
    const original = (await service.read(first.key))!;
    const receiveFailure = new Error('Stream failed');
    await expect(
      service.replace('logo', async (path) => {
        await fs.writeFile(path, 'partial');
        throw receiveFailure;
      }),
    ).rejects.toBe(receiveFailure);
    const writeFailure = Object.assign(new Error('Disk full'), {
      code: 'ENOSPC',
    });
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(writeFailure);
    await expect(upload()).rejects.toBe(writeFailure);
    rename.mockRestore();
    connection.db.$client.exec(
      "CREATE TRIGGER reject_brand BEFORE UPDATE OF logo_key ON site_settings BEGIN SELECT RAISE(ABORT, 'reference rejected'); END",
    );
    await expect(upload()).rejects.toThrow('reference rejected');
    expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
    expect(await service.read(first.key)).toEqual(original);
    expect(await files()).toEqual([first.key]);
  });

  it('删除数据库失败不删除旧文件；删除成功后仅清当前旧引用', async () => {
    const first = (await upload())!;
    connection.db.$client.exec(
      "CREATE TRIGGER reject_brand BEFORE UPDATE OF logo_key ON site_settings BEGIN SELECT RAISE(ABORT, 'reference rejected'); END",
    );
    await expect(service.remove('logo')).rejects.toThrow('reference rejected');
    expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
    expect((await service.read(first.key))?.bytes).toBeTruthy();
    expect(await files()).toEqual([first.key]);
  });

  it('提交后旧文件删除失败记录路径与原错误，下次启动清理重试', async () => {
    const first = (await upload())!;
    const failure = Object.assign(new Error('Permission denied'), {
      code: 'EACCES',
    });
    const remove = vi.spyOn(fs, 'rm').mockImplementationOnce(async () => {
      throw failure;
    });
    const next = (await upload('logo', 'static.jpg'))!;
    remove.mockRestore();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: failure, path: join(root, first.key) },
      expect.any(String),
    );
    expect(requireSiteSettings(connection.db).logoKey).toBe(next.key);
    expect(await files()).toEqual(
      expect.arrayContaining([first.key, next.key]),
    );
    await service.close();
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    service = createBrandingService({
      db: connection.db,
      brandingRoot: root,
      logger,
    });
    await service.ready;
    expect(await files()).toEqual([next.key]);
    expect((await service.read(next.key))?.mime).toBe('image/jpeg');
  });

  it('启动只清 site 自有孤立文件和中断目录，保留当前引用及其他模块文件', async () => {
    const first = (await upload())!;
    await service.close();
    const orphan = 'site-logo-11111111-1111-1111-1111-111111111111.svg';
    const interrupted = '.site-branding-22222222-2222-2222-2222-222222222222';
    await fs.writeFile(join(root, orphan), 'candidate');
    await fs.mkdir(join(root, interrupted));
    await fs.writeFile(join(root, interrupted, 'source'), 'partial');
    for (const name of [
      'unrelated.png',
      'site-logo-other.png',
      '.site-branding-other',
    ])
      await fs.writeFile(join(root, name), 'foreign');
    await fs.mkdir(
      join(root, 'site-logo-33333333-3333-3333-3333-333333333333.png'),
    );
    service = createBrandingService({
      db: connection.db,
      brandingRoot: root,
      logger,
    });
    await service.ready;
    expect((await files()).sort()).toEqual(
      [
        first.key,
        'unrelated.png',
        'site-logo-other.png',
        '.site-branding-other',
        'site-logo-33333333-3333-3333-3333-333333333333.png',
      ].sort(),
    );
    expect(await service.read(orphan)).toBeNull();
    expect(await service.read('../ariso.db')).toBeNull();
  });

  it.each(['receive', 'commit'])(
    '真实子进程在 %s 阶段退出，重启保留旧配置并清理候选',
    async (stage) => {
      const first = (await upload())!;
      await service.close();
      connection.close();
      const script = `
      import { openRuntimeDatabase } from ${JSON.stringify(new URL('../../../src/server/runtime/db.ts', import.meta.url).href)};
      import { createBrandingService } from ${JSON.stringify(new URL('../../../src/server/site/branding.ts', import.meta.url).href)};
      import { copyFile, writeFile } from 'node:fs/promises';
      const connection = openRuntimeDatabase(process.argv[1]);
      connection.db.$client.function('interrupt_branding', () => process.exit(42));
      if (process.argv[4] === 'commit') connection.db.$client.exec('CREATE TRIGGER interrupt_brand BEFORE UPDATE OF logo_key ON site_settings BEGIN SELECT interrupt_branding(); END');
      const service = createBrandingService({db: connection.db, brandingRoot: process.argv[2], logger: {warn: console.warn}});
      await service.replace('logo', async path => {
        if (process.argv[4] === 'receive') { await writeFile(path, 'partial upload'); process.exit(42); }
        await copyFile(process.argv[3], path);
      });
    `;
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          script,
          join(directory, 'ariso.db'),
          root,
          join(fixtures, 'static.jpg'),
          stage,
        ],
        { cwd: resolve('.'), encoding: 'utf8', timeout: 30_000 },
      );
      expect(result.status, result.stderr).toBe(42);
      expect(await files()).toHaveLength(stage === 'commit' ? 3 : 2);
      connection = openRuntimeDatabase(join(directory, 'ariso.db'));
      if (stage === 'commit')
        connection.db.$client.exec('DROP TRIGGER interrupt_brand');
      expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
      service = createBrandingService({
        db: connection.db,
        brandingRoot: root,
        logger,
      });
      await service.ready;
      expect(await files()).toEqual([first.key]);
      expect(await service.read(first.key)).toBeTruthy();
    },
  );

  it('候选已写入但提交前取消时保留旧引用，并等待磁盘操作完成清理', async () => {
    const first = await upload();
    const actual =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    let renamed!: () => void;
    const written = new Promise<void>((resolve) => {
      renamed = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fs, 'rename').mockImplementationOnce(async (source, target) => {
      await actual.rename(source, target);
      renamed();
      await blocked;
    });
    const replacement = upload('logo', 'static.jpg');
    await written;
    expect(await files()).toHaveLength(3);
    const closing = service.close();
    release();
    await expect(replacement).rejects.toMatchObject({
      code: 'UPLOAD_CANCELLED',
    });
    await closing;
    expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
    expect(await files()).toEqual([first.key]);
  });

  it('当前引用缺失明确报错且保留文件路径，不回退默认品牌', async () => {
    const first = (await upload())!;
    await fs.rm(join(root, first.key));
    await expect(service.read(first.key)).rejects.toMatchObject({
      code: 'SITE_ASSET_MISSING',
      status: 500,
      path: join(root, first.key),
      cause: { code: 'ENOENT' },
    });
    expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
  });

  it.each(['replace', 'remove'])(
    '读取旧素材期间 %s 已删除文件时返回未找到，不报告当前文件缺失',
    async (action) => {
      const first = await upload();
      const actual =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      let entered!: () => void;
      const reading = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(fs, 'readFile').mockImplementationOnce(async (...args) => {
        entered();
        await blocked;
        return actual.readFile(...args);
      });
      const oldRead = service.read(first.key);
      await reading;
      if (action === 'replace') await upload('logo', 'static.jpg');
      else await service.remove('logo');
      release();
      await expect(oldRead).resolves.toBeNull();
    },
  );

  it('并发替换以提交时旧引用清理，最终仅保留最后素材', async () => {
    await upload();
    await Promise.all([
      upload('logo', 'static.jpg'),
      upload('logo', 'static.webp'),
    ]);
    const key = requireSiteSettings(connection.db).logoKey!;
    expect(await files()).toEqual([key]);
    expect(await service.read(key)).toBeTruthy();
  });

  it('停止等待已接收操作退出，并禁止关闭后的提交和新操作', async () => {
    const first = (await upload())!;
    let received!: () => void;
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const replacement = service.replace('logo', async (path) => {
      await fs.copyFile(join(fixtures, 'source.png'), path);
      received();
      await blocked;
    });
    await started;
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await expect(replacement).rejects.toMatchObject({
      code: 'UPLOAD_CANCELLED',
    });
    await closing;
    expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
    expect(await files()).toEqual([first.key]);
    await expect(upload()).rejects.toMatchObject({ code: 'UPLOAD_CANCELLED' });
  });
});
