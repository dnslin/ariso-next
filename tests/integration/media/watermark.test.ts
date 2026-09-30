import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  readObject,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
  updateMediaSettings,
} from '../../../src/server/media/settings.ts';
import {
  initialMediaSettings,
  type MediaSettingsInput,
} from '../../../src/server/media/validation.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { createWatermarkAsset } from '../../../src/server/media/watermark-assets.ts';
import {
  prepareWatermark,
  watermarkFonts,
} from '../../../src/server/media/watermark.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-watermark-processing-'));
  for (const child of ['storage', 'tmp', 'watermarks'])
    await mkdir(join(directory, child));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    watermarksRoot: join(directory, 'watermarks'),
    logger: createRuntimeLogger('watermark.test', 'fatal'),
  };
});
afterEach(async () => {
  connection.close();
  await rm(directory, { recursive: true, force: true });
});
const state = (id: string) => getImageAccessState(connection.db, id)!;
async function image(args: string[], extension = 'png') {
  const path = join(directory, `${randomUUID()}.${extension}`);
  await execa('magick', [...args, path]);
  return path;
}
async function accept(
  bytes: Buffer,
  changes: Partial<MediaSettingsInput> = {},
) {
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, {
      ...initialMediaSettings,
      defaultLinkVersion: 'original',
      watermarkText: 'Ariso',
      ...changes,
    }),
  );
  const snapshot = connection.db.transaction(createProcessingSnapshot);
  const storage = resolveLocalUploadStorage(connection.db);
  const plan = planLocalWrite('uploads');
  await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: 'source.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      snapshot,
      expectedVersions: [
        ...(snapshot.compressionEnabled ? ['compressed' as const] : []),
        'thumbnail',
        ...(snapshot.watermarkMode !== 'off' ? ['watermark' as const] : []),
      ],
    }),
  );
  return { ...accepted, bytes };
}
async function processNext() {
  const job = claimNextMediaJob(connection.db)!;
  expect(job).not.toBeNull();
  await processMediaJob(runtime, job.id);
}
async function versionBytes(
  imageId: string,
  kind: 'original' | 'compressed' | 'thumbnail' | 'watermark',
) {
  const row = state(imageId).versions.find(
    (version) => version.kind === kind,
  )!.saved!;
  const object = await readObject(
    runtime.storageRoot,
    resolveLocalUploadStorage(connection.db, row.object.storageId),
    row.object.key,
    row.version.mime,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('T-MED-08 real watermark pipeline', () => {
  it.each([
    [false, 'off'],
    [true, 'off'],
    [false, 'text'],
    [true, 'text'],
  ] as const)(
    'creates exactly the selected versions (compression=%s, watermark=%s)',
    async (compressionEnabled, watermarkMode) => {
      const bytes = await readFile(
        await image(['-size', '200x120', 'xc:white']),
      );
      const accepted = await accept(bytes, {
        compressionEnabled,
        watermarkMode,
      });
      await processNext();
      expect(state(accepted.imageId).latestJob).toMatchObject({
        status: 'succeeded',
        error: null,
      });
      expect(state(accepted.imageId).image.processingStatus).toBe('ready');
      expect(
        state(accepted.imageId)
          .versions.filter((version) => version.saved)
          .map((version) => version.kind)
          .sort(),
      ).toEqual(
        [
          'original',
          'thumbnail',
          ...(compressionEnabled ? ['compressed'] : []),
          ...(watermarkMode !== 'off' ? ['watermark'] : []),
        ].sort(),
      );
      expect(await versionBytes(accepted.imageId, 'original')).toEqual(bytes);
    },
  );
});

async function pixels(bytes: Buffer) {
  const result = await execa(
    'magick',
    ['-', '-alpha', 'off', '-depth', '8', 'rgb:-'],
    { input: bytes, encoding: 'buffer' },
  );
  return Buffer.from(result.stdout);
}
function pixel(data: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 3;
  return [...data.subarray(offset, offset + 3)];
}
function darkBounds(data: Buffer, width: number) {
  const points: [number, number][] = [];
  for (let offset = 0; offset < data.length; offset += 3) {
    if (
      data[offset]! < 100 &&
      data[offset + 1]! < 100 &&
      data[offset + 2]! < 100
    )
      points.push([(offset / 3) % width, Math.floor(offset / 3 / width)]);
  }
  expect(points.length).toBeGreaterThan(0);
  return {
    left: Math.min(...points.map(([x]) => x)),
    right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
}
async function asset(args: string[]) {
  return createWatermarkAsset(
    {
      db: connection.db,
      watermarksRoot: join(directory, 'watermarks'),
      hasUploadReference: () => false,
    },
    await readFile(await image(args)),
    new AbortController().signal,
  );
}
async function watermark(bytes: Buffer, changes: Partial<MediaSettingsInput>) {
  const accepted = await accept(bytes, {
    compressionEnabled: false,
    quality: 100,
    ...changes,
  });
  await processNext();
  expect(state(accepted.imageId).latestJob).toMatchObject({
    status: 'succeeded',
    error: null,
  });
  return {
    ...accepted,
    output: await versionBytes(accepted.imageId, 'watermark'),
  };
}

it.each([
  ['top-left', 20, 20],
  ['top-center', 120, 20],
  ['top-right', 220, 20],
  ['center-left', 20, 85],
  ['center', 120, 85],
  ['center-right', 220, 85],
  ['bottom-left', 20, 150],
  ['bottom-center', 120, 150],
  ['bottom-right', 220, 150],
] as const)(
  'places an image watermark at %s with short-edge margins',
  async (watermarkPosition, left, top) => {
    const mark = await asset(['-size', '40x20', 'xc:black']);
    const result = await watermark(
      await readFile(await image(['-size', '300x200', 'xc:white'])),
      {
        watermarkMode: 'image',
        watermarkAssetId: mark.id,
        watermarkPosition,
        watermarkWidth: 20,
        watermarkMargin: 10,
        watermarkOpacity: 100,
      },
    );
    const rgb = await pixels(result.output);
    expect(darkBounds(rgb, 300)).toEqual({
      left,
      top,
      right: left + 59,
      bottom: top + 29,
    });
    expect(await versionBytes(result.imageId, 'original')).toEqual(
      result.bytes,
    );
  },
);

it('multiplies source alpha by configured opacity and preserves immutable image assets', async () => {
  const mark = await asset(['-size', '40x20', 'xc:rgba(0,0,0,0.5)']);
  const assetPath = join(directory, 'watermarks', mark.path);
  const before = await readFile(assetPath);
  const result = await watermark(
    await readFile(await image(['-size', '200x100', 'xc:white'])),
    {
      watermarkMode: 'image',
      watermarkAssetId: mark.id,
      watermarkPosition: 'center',
      watermarkWidth: 20,
      watermarkOpacity: 50,
    },
  );
  const center = pixel(await pixels(result.output), 200, 100, 50);
  for (const channel of center) expect(channel).toBeGreaterThanOrEqual(190);
  for (const channel of center) expect(channel).toBeLessThanOrEqual(193);
  expect(await readFile(assetPath)).toEqual(before);
});

it('fits a tall image within both margins while keeping its aspect ratio', async () => {
  const mark = await asset(['-size', '20x200', 'xc:black']);
  const result = await watermark(
    await readFile(await image(['-size', '300x200', 'xc:white'])),
    {
      watermarkMode: 'image',
      watermarkAssetId: mark.id,
      watermarkPosition: 'center',
      watermarkWidth: 100,
      watermarkMargin: 10,
      watermarkOpacity: 100,
    },
  );
  expect(darkBounds(await pixels(result.output), 300)).toEqual({
    left: 142,
    right: 157,
    top: 20,
    bottom: 179,
  });
});

it.each(['chinese', 'latin'] as const)(
  'renders multiline %s text using the queued color, stroke, font size and opacity',
  async (watermarkFont) => {
    const bytes = await readFile(await image(['-size', '600x300', 'xc:white']));
    const accepted = await accept(bytes, {
      compressionEnabled: false,
      quality: 100,
      watermarkMode: 'text',
      watermarkText:
        watermarkFont === 'chinese' ? '中文水印\nAriso' : 'Ariso\nPhoto',
      watermarkFont,
      watermarkFontSize: 10,
      watermarkColor: '#FF0000',
      watermarkStrokeColor: '#0000FF',
      watermarkStrokeWidth: 1,
      watermarkOpacity: 100,
      watermarkPosition: 'center',
    });
    connection.db.transaction((tx) =>
      updateMediaSettings(tx, {
        ...initialMediaSettings,
        watermarkMode: 'off',
      }),
    );
    await processNext();
    expect(state(accepted.imageId).latestJob).toMatchObject({
      status: 'succeeded',
      error: null,
    });
    const rgb = await pixels(await versionBytes(accepted.imageId, 'watermark'));
    let red = 0;
    let blue = 0;
    const occupiedRows = new Set<number>();
    for (let offset = 0; offset < rgb.length; offset += 3) {
      if (rgb[offset]! > 180 && rgb[offset + 1]! < 80 && rgb[offset + 2]! < 80)
        red++;
      if (rgb[offset]! < 80 && rgb[offset + 1]! < 80 && rgb[offset + 2]! > 180)
        blue++;
      if (rgb[offset + 1]! < 80) occupiedRows.add(Math.floor(offset / 3 / 600));
    }
    expect(red).toBeGreaterThan(100);
    expect(blue).toBeGreaterThan(100);
    expect(
      Math.max(...occupiedRows) - Math.min(...occupiedRows),
    ).toBeGreaterThan(30);
    expect(Math.max(...occupiedRows) - Math.min(...occupiedRows)).toBeLessThan(
      100,
    );
  },
);

it('fails oversized text explicitly while preserving originals and already published versions', async () => {
  const bytes = await readFile(await image(['-size', '120x80', 'xc:white']));
  const accepted = await accept(bytes, {
    watermarkMode: 'text',
    watermarkText: 'W'.repeat(200),
    watermarkFont: 'latin',
    watermarkFontSize: 20,
  });
  await processNext();
  const result = state(accepted.imageId);
  expect(result.image.processingStatus).toBe('failed');
  expect(result.latestJob).toMatchObject({
    status: 'failed',
    retryCount: 0,
    error: expect.stringMatching(
      /watermark:.*(TEXT_TOO_LARGE|TEXT_OVERFLOW|WATERMARK_TOO_LARGE)/,
    ),
  });
  expect(
    result.versions.find((version) => version.kind === 'watermark')!.status,
  ).toBe('failed');
  expect(
    result.versions
      .filter((version) => version.saved)
      .map((version) => version.kind)
      .sort(),
  ).toEqual(['compressed', 'original', 'thumbnail']);
  expect(await versionBytes(accepted.imageId, 'original')).toEqual(bytes);
});

it.each([false, true])(
  'orients and resizes the canvas, strips private metadata and emits actual JPEG (compression=%s)',
  async (compressionEnabled) => {
    const path = await image(
      [
        '-size',
        '300x200',
        'xc:red',
        '-fill',
        'blue',
        '-draw',
        'rectangle 150,0 299,199',
      ],
      'jpg',
    );
    await execa('exiftool', [
      '-overwrite_original',
      '-Orientation#=6',
      '-Artist=private-author',
      '-GPSLatitude=51.5',
      '-GPSLongitude=0.1',
      '-XMP:Label=private-label',
      '-IPTC:Caption-Abstract=private-caption',
      path,
    ]);
    const bytes = await readFile(path);
    const result = await watermark(bytes, {
      compressionEnabled,
      outputFormat: 'jpeg',
      maxEdge: 150,
      watermarkMode: 'text',
      watermarkText: 'Ariso',
      watermarkOpacity: 0,
    });
    const facts = JSON.parse(
      (
        await execa(
          'exiftool',
          [
            '-json',
            '-FileType',
            '-ImageWidth',
            '-ImageHeight',
            '-EXIF:all',
            '-XMP:all',
            '-IPTC:all',
            '-ICC_Profile:all',
            '-',
          ],
          { input: result.output },
        )
      ).stdout,
    )[0];
    expect(facts).toEqual({
      SourceFile: '-',
      FileType: 'JPEG',
      ImageWidth: 100,
      ImageHeight: 150,
    });
    const rgb = await pixels(result.output);
    expect(pixel(rgb, 100, 50, 25)[0]).toBeGreaterThan(230);
    expect(pixel(rgb, 100, 50, 125)[2]).toBeGreaterThan(230);
    expect(await versionBytes(result.imageId, 'original')).toEqual(bytes);
  },
);

it('flattens transparent source pixels onto the configured JPEG background before compositing', async () => {
  const result = await watermark(
    await readFile(await image(['-size', '200x100', 'xc:none'])),
    {
      outputFormat: 'jpeg',
      jpegBackground: '#00FF00',
      watermarkMode: 'text',
      watermarkText: 'Ariso',
      watermarkOpacity: 0,
    },
  );
  const rgb = await pixels(result.output);
  const sample = pixel(rgb, 200, 10, 10);
  expect(sample[0]).toBeLessThan(5);
  expect(sample[1]).toBeGreaterThan(250);
  expect(sample[2]).toBeLessThan(5);
});

it('uses the actual newly encoded compressed pixels for the watermark input', async () => {
  const bytes = await readFile(
    await image(['-seed', '152', '-size', '128x96', 'plasma:fractal']),
  );
  const result = await watermark(bytes, {
    compressionEnabled: true,
    quality: 20,
    maxEdge: 80,
    watermarkMode: 'text',
    watermarkOpacity: 0,
  });
  const compressed = await versionBytes(result.imageId, 'compressed');
  const expected = await execa(
    'magick',
    ['webp:-', '-strip', '-quality', '20', 'webp:-'],
    { input: compressed, encoding: 'buffer' },
  );
  const fromOriginal = await execa(
    'magick',
    [
      'png:-',
      '-auto-orient',
      '-colorspace',
      'sRGB',
      '-resize',
      '80x80>',
      '-strip',
      '-quality',
      '20',
      'webp:-',
    ],
    { input: bytes, encoding: 'buffer' },
  );
  const outputPixels = await pixels(result.output);
  expect(outputPixels).toEqual(await pixels(Buffer.from(expected.stdout)));
  expect(outputPixels).not.toEqual(
    await pixels(Buffer.from(fromOriginal.stdout)),
  );
});

it('renders percent expressions, readable file paths, backslashes and newlines as literal text', async () => {
  const secretPath = join(directory, 'private-text.txt');
  await writeFile(secretPath, 'THIS MUST NOT REPLACE THE LITERAL PATH');
  const text = `@${secretPath}\n%[fx:1+1] %w \\n \\ \\@`;
  const textFile = join(directory, 'literal.txt');
  await writeFile(textFile, text);
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, {
      ...initialMediaSettings,
      watermarkMode: 'text',
      watermarkText: text,
      watermarkFont: 'latin',
      watermarkFontSize: 3,
      watermarkColor: '#123456',
      watermarkStrokeWidth: 0,
      watermarkOpacity: 100,
    }),
  );
  const snapshot = connection.db.transaction(createProcessingSnapshot);
  await prepareWatermark({
    sourceArgs: ['-size', '1600x800', 'xc:white'],
    snapshot,
    workspace: runtime.temporaryRoot,
    diskLimitBytes: 64 * 1024 * 1024,
    signal: new AbortController().signal,
  });
  // ImageMagick's label:@file reader consumes file content literally, independently
  // of the production escape function used for inline label: arguments.
  const expectedPath = join(directory, 'literal-reference.png');
  await execa('magick', [
    '-background',
    'none',
    '-density',
    '72',
    '-font',
    watermarkFonts.latin,
    '-pointsize',
    '24',
    '-fill',
    '#123456',
    '-stroke',
    '#000000',
    '-strokewidth',
    '0',
    `label:@${textFile}`,
    expectedPath,
  ]);
  const actualPath = join(runtime.temporaryRoot, 'watermark-overlay.png');
  const decode = async (path: string) =>
    (
      await execa('magick', [path, '-depth', '8', 'rgba:-'], {
        encoding: 'buffer',
      })
    ).stdout;
  expect(await decode(actualPath)).toEqual(await decode(expectedPath));
  const dimensions = async (path: string) =>
    (await execa('magick', ['identify', '-format', '%w %h', path])).stdout;
  expect(await dimensions(actualPath)).toEqual(await dimensions(expectedPath));
});

it('renders actual Chinese glyphs instead of the missing-glyph box', async () => {
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, {
      ...initialMediaSettings,
      watermarkMode: 'text',
      watermarkText: '水',
      watermarkFont: 'chinese',
      watermarkFontSize: 10,
      watermarkColor: '#000000',
      watermarkOpacity: 100,
    }),
  );
  const snapshot = connection.db.transaction(createProcessingSnapshot);
  await prepareWatermark({
    sourceArgs: ['-size', '300x300', 'xc:white'],
    snapshot,
    workspace: runtime.temporaryRoot,
    diskLimitBytes: 64 * 1024 * 1024,
    signal: new AbortController().signal,
  });
  const actual = await readFile(
    join(runtime.temporaryRoot, 'watermark-overlay.png'),
  );
  const reference = await execa(
    'magick',
    [
      '-background',
      'none',
      '-density',
      '72',
      '-font',
      watermarkFonts.chinese,
      '-pointsize',
      '30',
      '-fill',
      '#000000',
      `label:${String.fromCodePoint(0x10ffff)}`,
      '-depth',
      '8',
      'rgba:-',
    ],
    { encoding: 'buffer' },
  );
  const actualPixels = await execa(
    'magick',
    ['png:-', '-depth', '8', 'rgba:-'],
    { input: actual, encoding: 'buffer' },
  );
  expect(actualPixels.stdout).not.toEqual(reference.stdout);
});

describe.each(['WEBP', 'SVG'] as const)('real %s image asset', (format) => {
  let mark: Awaited<ReturnType<typeof createWatermarkAsset>>;
  beforeEach(async () => {
    const source =
      format === 'SVG'
        ? Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="black"/></svg>',
          )
        : await readFile(
            await image(
              ['-size', '40x20', 'xc:black', '-quality', '82'],
              'webp',
            ),
          );
    mark = await createWatermarkAsset(
      {
        db: connection.db,
        watermarksRoot: join(directory, 'watermarks'),
        hasUploadReference: () => false,
      },
      source,
      new AbortController().signal,
    );
    expect(mark.format).toBe(format);
  });
  it('composites the admitted asset at the configured size', async () => {
    const result = await watermark(
      await readFile(await image(['-size', '200x100', 'xc:white'])),
      {
        watermarkMode: 'image',
        watermarkAssetId: mark.id,
        watermarkPosition: 'center',
        watermarkWidth: 20,
        watermarkOpacity: 100,
      },
    );
    expect(darkBounds(await pixels(result.output), 200)).toEqual({
      left: 80,
      right: 119,
      top: 40,
      bottom: 59,
    });
  });
});

it('keeps GIF watermark and compression not applicable even when both settings are enabled', async () => {
  const bytes = await readFile(
    await image(['-size', '100x60', 'xc:red'], 'gif'),
  );
  const accepted = await accept(bytes, {
    compressionEnabled: true,
    watermarkMode: 'text',
  });
  await processNext();
  const result = state(accepted.imageId);
  expect(result.latestJob).toMatchObject({
    status: 'succeeded',
    error: null,
    expectedVersions: ['thumbnail'],
  });
  expect(
    result.versions
      .filter((version) => version.saved)
      .map((version) => version.kind),
  ).toEqual(['original', 'thumbnail']);
  for (const kind of ['compressed', 'watermark'])
    expect(
      result.versions.find((version) => version.kind === kind)!.status,
    ).toBe('not_applicable');
  expect(await versionBytes(accepted.imageId, 'original')).toEqual(bytes);
});

it('fits a tall image when the exact width rounds up past the available height', async () => {
  const mark = await asset(['-size', '20x200', 'xc:black']);
  const result = await watermark(
    await readFile(await image(['-size', '300x199', 'xc:white'])),
    {
      watermarkMode: 'image',
      watermarkAssetId: mark.id,
      watermarkPosition: 'center',
      watermarkWidth: 100,
      watermarkMargin: 10,
      watermarkOpacity: 100,
    },
  );
  expect(darkBounds(await pixels(result.output), 300)).toEqual({
    left: 142,
    right: 157,
    top: 20,
    bottom: 178,
  });
});

it('encodes a real AVIF watermark version without upscaling', async () => {
  const result = await watermark(
    await readFile(await image(['-size', '100x60', 'xc:white'])),
    {
      outputFormat: 'avif',
      maxEdge: 200,
      quality: 50,
      watermarkMode: 'text',
      watermarkColor: '#000000',
      watermarkOpacity: 100,
    },
  );
  const metadata = JSON.parse(
    (
      await execa(
        'exiftool',
        ['-json', '-FileType', '-MIMEType', '-ImageWidth', '-ImageHeight', '-'],
        { input: result.output },
      )
    ).stdout,
  )[0];
  expect(metadata).toMatchObject({
    FileType: 'AVIF',
    MIMEType: 'image/avif',
    ImageWidth: 100,
    ImageHeight: 60,
  });
  expect(
    state(result.imageId).versions.find(
      (version) => version.kind === 'watermark',
    )!.saved!.version,
  ).toMatchObject({
    format: 'AVIF',
    mime: 'image/avif',
    width: 100,
    height: 60,
    byteSize: result.output.length,
  });
});
