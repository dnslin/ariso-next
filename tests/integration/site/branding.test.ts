import * as fs from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { execa } from 'execa';
import { inspectImageFile } from '../../../src/server/media/file-formats.ts';
import * as mediaTools from '../../../src/server/media/tools.ts';
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

  it.each(['source.png', 'multiple.ico', 'static.svg'])(
    'Favicon %s 输出单张 48×48 PNG，数据库记录输出类型',
    async (fixture) => {
      const asset = await upload('favicon', fixture);
      const saved = (await service.read(asset.key))!;
      expect(asset).toMatchObject({
        key: expect.stringMatching(/^site-favicon-.*\.png$/),
        mime: 'image/png',
      });
      expect(saved.bytes.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(saved.bytes.readUInt32BE(16)).toBe(48);
      expect(saved.bytes.readUInt32BE(20)).toBe(48);
      expect(requireSiteSettings(connection.db)).toMatchObject({
        faviconKey: asset.key,
        faviconMime: 'image/png',
      });
      expect(await files()).toEqual([asset.key]);
    },
  );

  it('Favicon 等比缩小并透明居中，删除元数据，简单图标缩到几 KB', async () => {
    const source = join(directory, 'wide.png');
    await execa('magick', [
      '-size',
      '512x256',
      'xc:red',
      '-set',
      'comment',
      'remove this metadata',
      '-define',
      'png:compression-level=0',
      source,
    ]);
    const asset = await service.replace('favicon', (path) =>
      fs.copyFile(source, path),
    );
    const saved = (await service.read(asset.key))!;
    expect(saved.bytes.length).toBeLessThan(5 * 1024);
    expect(saved.bytes.length).toBeLessThan((await fs.stat(source)).size);
    const { stdout: pixels } = await execa(
      'magick',
      [join(root, asset.key), '-depth', '8', 'rgba:-'],
      { encoding: 'buffer' },
    );
    const pixel = (x: number, y: number) => [
      ...pixels.subarray((y * 48 + x) * 4, (y * 48 + x + 1) * 4),
    ];
    expect(pixel(24, 11)[3]).toBe(0);
    expect(pixel(24, 12)).toEqual([255, 0, 0, 255]);
    expect(pixel(24, 35)).toEqual([255, 0, 0, 255]);
    expect(pixel(24, 36)[3]).toBe(0);
    const { stdout: metadata } = await execa('exiftool', [
      '-Comment',
      '-EXIF:all',
      '-XMP:all',
      join(root, asset.key),
    ]);
    expect(metadata).toBe('');
  });

  it('小尺寸 SVG 直接按目标像素栅格化，保留清晰边缘与透明区域', async () => {
    const asset = await service.replace('favicon', (path) =>
      fs.writeFile(
        path,
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="0.5" height="1" fill="red"/></svg>',
      ),
    );
    const { stdout: pixels } = await execa(
      'magick',
      [join(root, asset.key), '-depth', '8', 'rgba:-'],
      { encoding: 'buffer' },
    );
    expect(pixels[(24 * 48 + 23) * 4 + 3]).toBe(255);
    expect(pixels[(24 * 48 + 24) * 4 + 3]).toBe(0);
  });

  it('Favicon 保留 Display P3 颜色解释并移除无关元数据', async () => {
    const source = join(directory, 'display-p3.png');
    await execa('magick', [
      '-size',
      '48x48',
      'xc:rgb(128,64,192)',
      '-profile',
      join(fixtures, 'DisplayP3-v4.icc'),
      '-set',
      'label',
      'remove this text chunk',
      '-set',
      'comment',
      'remove this metadata',
      source,
    ]);
    const asset = await service.replace('favicon', (path) =>
      fs.copyFile(source, path),
    );
    const output = join(root, asset.key);
    const normalized = async (path: string) =>
      (
        await execa(
          'magick',
          [
            path,
            '-profile',
            join(fixtures, 'sRGB2014.icc'),
            '-depth',
            '8',
            'rgba:-',
          ],
          { encoding: 'buffer' },
        )
      ).stdout;
    const expected = await normalized(source);
    // Color-managed display differs from treating the P3 samples as sRGB.
    expect([...expected.subarray(0, 3)]).not.toEqual([128, 64, 192]);
    expect(await normalized(output)).toEqual(expected);
    expect((await service.read(asset.key))!.bytes.length).toBeLessThan(
      5 * 1024,
    );
    const { stdout: metadata } = await execa('exiftool', [
      '-Label',
      '-Comment',
      '-EXIF:all',
      '-XMP:all',
      output,
    ]);
    expect(metadata).toBe('');
  });

  it('Favicon 保留无 ICC 的线性 PNG 颜色解释', async () => {
    const source = join(directory, 'linear.png');
    await execa('magick', [
      '-size',
      '48x48',
      'xc:rgb(128,64,192)',
      '-set',
      'gamma',
      '1',
      '-define',
      'png:include-chunks=gAMA,cHRM',
      source,
    ]);
    const asset = await service.replace('favicon', (path) =>
      fs.copyFile(source, path),
    );
    const normalized = async (path: string) =>
      (
        await execa(
          'magick',
          [path, '-colorspace', 'sRGB', '-depth', '8', 'rgba:-'],
          { encoding: 'buffer' },
        )
      ).stdout;
    const expected = await normalized(source);
    expect([...expected.subarray(0, 3)]).not.toEqual([128, 64, 192]);
    expect(await normalized(join(root, asset.key))).toEqual(expected);
  });

  it.each([
    [1, 100],
    [100, 1],
    [0.1, 10],
    [10, 0.1],
  ])('细长 SVG %s×%s 生成透明居中的 48×48 Favicon', async (width, height) => {
    const asset = await service.replace('favicon', (path) =>
      fs.writeFile(
        path,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="red"/></svg>`,
      ),
    );
    const saved = (await service.read(asset.key))!;
    expect(saved.bytes.readUInt32BE(16)).toBe(48);
    expect(saved.bytes.readUInt32BE(20)).toBe(48);
    const { stdout: pixels } = await execa(
      'magick',
      [join(root, asset.key), '-depth', '8', 'rgba:-'],
      { encoding: 'buffer' },
    );
    let painted = 0;
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const pixel = pixels.subarray((y * 48 + x) * 4, (y * 48 + x + 1) * 4);
        if (!pixel[3]) continue;
        expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
        expect(width < height ? x : y).toBeGreaterThanOrEqual(23);
        expect(width < height ? x : y).toBeLessThanOrEqual(24);
        painted++;
      }
    }
    expect(painted).toBeGreaterThanOrEqual(48);
    expect(requireSiteSettings(connection.db).faviconKey).toBe(asset.key);
    expect(await files()).toEqual([asset.key]);
  });

  it.each([
    [64, 48, '0,128,0'],
    [32, 24, '0,0,255'],
  ])(
    '多尺寸 ICO 选择合适帧：%s / %s，避免放大首帧',
    async (larger, smaller, color) => {
      const source = join(directory, 'sizes.ico');
      await execa('magick', [
        '(',
        '-size',
        '16x16',
        'xc:red',
        ')',
        '(',
        '-size',
        `${larger}x${larger}`,
        'xc:blue',
        ')',
        '(',
        '-size',
        `${smaller}x${smaller}`,
        'xc:green',
        ')',
        source,
      ]);
      const asset = await service.replace('favicon', (path) =>
        fs.copyFile(source, path),
      );
      const { stdout } = await execa('magick', [
        join(root, asset.key),
        '-format',
        '%[pixel:p{24,24}]',
        'info:',
      ]);
      expect(stdout).toContain(color);
    },
  );

  it('Favicon 生成或数据库提交失败保留旧引用、字节并清理候选', async () => {
    const first = await upload('favicon');
    const original = await service.read(first.key);
    const start = mediaTools.startMediaTool;
    const tool = vi
      .spyOn(mediaTools, 'startMediaTool')
      .mockImplementation((command, args, options) =>
        start(
          command,
          args.includes('-resize')
            ? [...args, '-invalid-favicon-option']
            : args,
          options,
        ),
      );
    await expect(upload('favicon')).rejects.toThrow();
    tool.mockRestore();
    expect(requireSiteSettings(connection.db).faviconKey).toBe(first.key);
    expect(await service.read(first.key)).toEqual(original);
    expect(await files()).toEqual([first.key]);
    const cleanup = vi
      .spyOn(mediaTools, 'startMediaTool')
      .mockImplementation((command, args, options) =>
        start(
          command,
          command === 'exiftool' && args.includes('-all=')
            ? [join(root, 'missing-favicon-output.png')]
            : args,
          options,
        ),
      );
    await expect(upload('favicon')).rejects.toThrow();
    cleanup.mockRestore();
    expect(requireSiteSettings(connection.db).faviconKey).toBe(first.key);
    expect(await service.read(first.key)).toEqual(original);
    expect(await files()).toEqual([first.key]);
    connection.db.$client.exec(
      "CREATE TRIGGER reject_favicon BEFORE UPDATE OF favicon_key ON site_settings BEGIN SELECT RAISE(ABORT, 'favicon reference rejected'); END",
    );
    await expect(upload('favicon')).rejects.toThrow(
      'favicon reference rejected',
    );
    expect(requireSiteSettings(connection.db).faviconKey).toBe(first.key);
    expect(await service.read(first.key)).toEqual(original);
    expect(await files()).toEqual([first.key]);
  });

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

  it('拒绝无扩展名的非动画双图 JPEG，并保留旧引用及字节', async () => {
    const first = await upload();
    const previous = await service.read(first.key);
    await expect(
      service.replace('logo', async (path, signal) => {
        await fs.copyFile(join(fixtures, 'multiple.mpo'), path);
        expect(await inspectImageFile(path, root, signal)).toMatchObject({
          format: 'JPEG',
          animated: false,
          pageCount: 2,
        });
      }),
    ).rejects.toMatchObject({ code: 'SITE_ASSET_INVALID', status: 400 });
    expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
    expect(await service.read(first.key)).toEqual(previous);
    expect(await files()).toEqual([first.key]);
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

  it('校验工具启动后父进程突然退出，重启先回收工具再清理工作目录', async () => {
    const first = await upload();
    const previous = await service.read(first.key);
    await service.close();
    const foreign = join(root, '.site-branding-other');
    await fs.mkdir(foreign);
    await fs.writeFile(join(foreign, 'keep'), 'another owner');
    const bin = join(directory, 'bin');
    await fs.mkdir(bin);
    const pidPath = join(directory, 'test-tool.pid');
    // Only the blocking tool is a stand-in; production starts its real detached
    // process group through replace → inspectImageFile → startMediaTool.
    await fs.writeFile(
      join(bin, 'exiftool'),
      `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidPath)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`,
      { mode: 0o755 },
    );
    const script = `
      import { openRuntimeDatabase } from ${JSON.stringify(new URL('../../../src/server/runtime/db.ts', import.meta.url).href)};
      import { createBrandingService } from ${JSON.stringify(new URL('../../../src/server/site/branding.ts', import.meta.url).href)};
      import { copyFile } from 'node:fs/promises';
      const connection = openRuntimeDatabase(process.argv[1]);
      const service = createBrandingService({db: connection.db, brandingRoot: process.argv[2], logger: {warn: console.warn}});
      await service.replace('logo', path => copyFile(process.argv[3], path));
    `;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        script,
        join(directory, 'ariso.db'),
        root,
        join(fixtures, 'static.jpg'),
      ],
      {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        stdio: 'ignore',
      },
    );
    const closed = once(child, 'close');
    let toolPid: number | undefined;
    const toolRunning = async () => {
      const { stdout } = await execa(
        'ps',
        ['-p', String(toolPid), '-o', 'stat='],
        {
          reject: false,
        },
      );
      return stdout.trim() !== '' && !stdout.trim().startsWith('Z');
    };
    try {
      await vi.waitFor(
        async () => {
          toolPid = Number(await fs.readFile(pidPath, 'utf8'));
          expect(await toolRunning()).toBe(true);
        },
        { timeout: 3000, interval: 10 },
      );
      const workspaces = (await files()).filter((name) =>
        /^\.site-branding-[0-9a-f-]{36}$/.test(name),
      );
      expect(workspaces).toHaveLength(1);
      child.kill('SIGKILL');
      expect((await closed)[1]).toBe('SIGKILL');
      expect(await toolRunning()).toBe(true);
      service = createBrandingService({
        db: connection.db,
        brandingRoot: root,
        logger,
      });
      await service.ready;
      expect(await toolRunning()).toBe(false);
      expect((await files()).sort()).toEqual(
        [first.key, '.site-branding-other'].sort(),
      );
      expect(requireSiteSettings(connection.db).logoKey).toBe(first.key);
      expect(await service.read(first.key)).toEqual(previous);
      expect(await fs.readFile(join(foreign, 'keep'), 'utf8')).toBe(
        'another owner',
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await closed;
      toolPid ??= await fs
        .readFile(pidPath, 'utf8')
        .then(Number, () => undefined);
      if (toolPid) {
        try {
          process.kill(-toolPid, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
    }
  });

  it('中断工具回收失败时保留目录和路径诊断，下次启动重试', async () => {
    const first = await upload();
    await service.close();
    const workspace = join(
      root,
      '.site-branding-22222222-2222-2222-2222-222222222222',
    );
    await fs.mkdir(workspace);
    await fs.writeFile(join(workspace, 'source'), 'partial');
    const failure = new Error('Cannot inspect media tool processes');
    const terminate = vi
      .spyOn(mediaTools, 'terminateMediaTools')
      .mockRejectedValueOnce(failure);
    service = createBrandingService({
      db: connection.db,
      brandingRoot: root,
      logger,
    });
    await service.ready;
    expect(await fs.readFile(join(workspace, 'source'), 'utf8')).toBe(
      'partial',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { err: failure, path: workspace },
      expect.any(String),
    );
    expect(await service.read(first.key)).toBeTruthy();
    await service.close();
    terminate.mockRestore();
    service = createBrandingService({
      db: connection.db,
      brandingRoot: root,
      logger,
    });
    await service.ready;
    expect(await files()).toEqual([first.key]);
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
