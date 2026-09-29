import { requireLocalStorage } from '../../../src/server/storage/settings.ts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
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
  resolveUploadStorage,
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
} from '../../../src/server/media/settings.ts';
import { type ProcessingSnapshot } from '../../../src/server/media/validation.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import manifest from '../../fixtures/media-formats/manifest.json';
import { assertPixels } from '../../experiments/media-formats/checks.mjs';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-processing-'));
  await mkdir(join(directory, 'storage'));
  await mkdir(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: createRuntimeLogger('media.test', 'fatal'),
  };
});
afterEach(async () => {
  connection.close();
  await rm(directory, { recursive: true, force: true });
});

async function accept(
  bytes: Buffer,
  changes: Partial<ProcessingSnapshot> = {},
) {
  const storage = resolveUploadStorage(connection.db);
  requireLocalStorage(storage);
  const plan = planLocalWrite('uploads');
  await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
  const snapshot = {
    ...connection.db.transaction(createProcessingSnapshot),
    ...changes,
  };
  const result = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: '伪装文件.JPG',
      visibility: 'public',
      format: 'JPEG',
      mime: 'image/jpeg',
      byteSize: bytes.length,
      snapshot,
      expectedVersions: snapshot.compressionEnabled
        ? ['compressed', 'thumbnail']
        : ['thumbnail'],
    }),
  );
  return { ...result, storage, key: plan.key, bytes };
}
async function processNext() {
  const job = claimNextMediaJob(connection.db)!;
  expect(job).not.toBeNull();
  await processMediaJob(runtime, job.id);
}
const state = (id: string) => getImageAccessState(connection.db, id)!;
async function versionBytes(
  imageId: string,
  kind: 'original' | 'compressed' | 'thumbnail',
) {
  const row = state(imageId).versions.find((v) => v.kind === kind)!.saved!;
  const storage = resolveUploadStorage(connection.db, row.object.storageId);
  requireLocalStorage(storage);
  const object = await readObject(
    runtime.storageRoot,
    storage,
    row.object.key,
    row.version.mime,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
describe('T-MED-06 full-format persistent processing', () => {
  it.each(manifest.samples)(
    '$id preserves original bytes and publishes applicable versions',
    async (sample) => {
      const bytes = await readFile(
        resolve('tests/fixtures/media-formats', sample.file),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        sample.sha256,
      );
      const accepted = await accept(bytes);
      await processNext();
      const result = state(accepted.imageId);
      expect(result.latestJob?.error).toBeNull();
      const classification =
        sample.expected.classification === 'animation'
          ? 'animated'
          : sample.expected.classification === 'static'
            ? 'static'
            : 'preview_only';
      expect(result.image).toMatchObject({
        processingStatus: 'ready',
        classification,
      });
      const kinds =
        classification === 'static'
          ? ['original', 'compressed', 'thumbnail']
          : ['original', 'thumbnail'];
      expect(result.versions.filter((v) => v.saved).map((v) => v.kind)).toEqual(
        kinds,
      );
      expect(
        result.versions.find((v) => v.kind === 'compressed')?.applicable,
      ).toBe(classification === 'static');
      expect(await versionBytes(accepted.imageId, 'original')).toEqual(bytes);
      const output = await versionBytes(accepted.imageId, 'thumbnail');
      const decoded = await execa(
        'magick',
        ['webp:-', '-depth', '8', 'rgba:-'],
        { input: output, encoding: 'buffer' },
      );
      assertPixels(
        decoded.stdout,
        sample.preview.width,
        sample.preview.height,
        sample.preview.pixels,
      );
    },
  );
});

it.each(['jpeg', 'webp', 'avif'] as const)(
  'encodes actual %s with the snapshot, shrinks without upscaling, and keeps thumbnails WebP',
  async (outputFormat) => {
    const source = await execa(
      'magick',
      [
        '-size',
        '80x40',
        'xc:none',
        '-fill',
        'red',
        '-draw',
        'rectangle 0,0 39,39',
        'png:-',
      ],
      { encoding: 'buffer' },
    );
    const accepted = await accept(Buffer.from(source.stdout), {
      outputFormat,
      jpegBackground: '#0000FF',
      maxEdge: 40,
    });
    await processNext();
    const result = state(accepted.imageId);
    expect(result.latestJob?.error).toBeNull();
    const compressed = result.versions.find((v) => v.kind === 'compressed')!
      .saved!.version;
    expect(compressed).toMatchObject({
      mime: `image/${outputFormat}`,
      width: 40,
      height: 20,
    });
    expect(
      result.versions.find((v) => v.kind === 'thumbnail')!.saved!.version,
    ).toMatchObject({ mime: 'image/webp', width: 80, height: 40 });
    const bytes = await versionBytes(accepted.imageId, 'compressed');
    const decoded = await execa(
      'magick',
      [`${outputFormat}:-`, '-depth', '8', 'rgba:-'],
      { input: bytes, encoding: 'buffer' },
    );
    assertPixels(decoded.stdout, 40, 20, [
      {
        x: 30,
        y: 10,
        rgba: outputFormat === 'jpeg' ? [0, 0, 255, 255] : [0, 0, 0, 0],
        tolerance: 25,
      },
    ]);
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      Buffer.from(source.stdout),
    );
  },
);
