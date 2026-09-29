import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import {
  readMediaMetadata,
  requestMetadataRead,
} from '../../../src/server/media/metadata.ts';
import { processMetadataJob } from '../../../src/server/media/metadata-job.ts';
import type { GroupedMetadata } from '../../../src/server/media/metadata-values.ts';
import * as mediaTools from '../../../src/server/media/tools.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
const serial = '123456789012345678901234567890';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-metadata-'));
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
    logger: createRuntimeLogger('metadata.test', 'fatal'),
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  connection.close();
  await rm(directory, { recursive: true, force: true });
});

async function accept(bytes: Buffer) {
  const storage = resolveLocalUploadStorage(connection.db);
  const plan = planLocalWrite('uploads');
  await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
  return connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: 'metadata.jpg',
      visibility: 'public',
      format: 'JPEG',
      mime: 'image/jpeg',
      byteSize: bytes.length,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
}

async function processNext() {
  const job = claimNextMediaJob(connection.db)!;
  expect(job).not.toBeNull();
  await (job.kind === 'metadata' ? processMetadataJob : processMediaJob)(
    runtime,
    job.id,
  );
  return job;
}

async function versionBytes(
  imageId: string,
  kind: 'original' | 'compressed' | 'thumbnail',
) {
  const row = getImageAccessState(connection.db, imageId)!.versions.find(
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

function imageState(imageId: string) {
  return {
    image: connection.db
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, imageId))
      .get(),
    versions: connection.db
      .select()
      .from(mediaVersions)
      .where(eq(mediaVersions.imageId, imageId))
      .all(),
    objects: connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.imageId, imageId))
      .all(),
  };
}

function originalPath(imageId: string) {
  const object = imageState(imageId).objects.find(
    (entry) => entry.purpose === 'original',
  )!;
  const storage = resolveLocalUploadStorage(connection.db, object.storageId);
  return join(
    runtime.storageRoot,
    storage.localPath,
    'ariso',
    storage.id,
    object.key,
  );
}

function values(data: GroupedMetadata, group: string, tag: string) {
  return Object.entries(data)
    .filter(([key]) => key.startsWith(`${group}:`) && key.endsWith(`:${tag}`))
    .map(([, value]) => value);
}

async function complexJpeg() {
  const source = join(directory, 'complex.jpg');
  await execa('magick', [
    '-size',
    '32x16',
    'xc:red',
    '-profile',
    resolve('tests/fixtures/media-formats/sRGB2014.icc'),
    source,
  ]);
  await execa('exiftool', [
    '-overwrite_original',
    '-TagsFromFile',
    resolve('tests/fixtures/media-metadata/Nikon.jpg'),
    '-All:All',
    '-EXIF:Artist=first',
    '-XMP-tiff:Artist=other-group',
    '-EXIF:ImageDescription=1.10',
    `-ExifIFD:SerialNumber=${serial}`,
    '-GPSLatitude=31.2',
    '-GPSLatitudeRef=N',
    '-GPSLongitude=121.5',
    '-GPSLongitudeRef=E',
    '-Orientation#=6',
    '-XMP-dc:Subject=1.10',
    '-XMP-dc:Subject+=second',
    '-XMP-mwg-rs:RegionInfo={AppliedToDimensions={W=32,H=16,Unit=pixel},RegionList=[{Name=1.10,Type=Face,Area={X=0.5,Y=0.5,W=0.2,H=0.2,Unit=normalized}}]}',
    source,
  ]);
  const { stdout: exif } = await execa('exiftool', ['-b', '-EXIF', source], {
    encoding: 'buffer',
  });
  await execa('exiftool', [
    '-overwrite_original',
    '-EXIF:Artist=second',
    source,
  ]);
  const jpeg = await readFile(source);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(exif.length + 8, 2);
  const bytes = Buffer.concat([
    jpeg.subarray(0, 2),
    header,
    Buffer.from('Exif\0\0'),
    exif,
    jpeg.subarray(2),
  ]);
  await writeFile(source, bytes);
  return bytes;
}

// Change only the complete-read budget; format classification still uses the real tools normally.
function restrictCompleteRead(limit: 'timeout' | 'output') {
  const start = mediaTools.startMediaTool;
  return vi
    .spyOn(mediaTools, 'startMediaTool')
    .mockImplementation((command, args, options) =>
      start(
        command,
        args,
        command === 'exiftool' && args.includes('structformat=jsonq')
          ? {
              ...options,
              ...(limit === 'timeout' ? { timeout: 1 } : { maxBuffer: 64 }),
            }
          : options,
      ),
    );
}

describe('T-MED-07 complete metadata with real ExifTool and ImageMagick', () => {
  it('persists all groups and duplicate tags without converting strings, arrays, or nested XMP', async () => {
    const bytes = await complexJpeg();
    const { imageId } = await accept(bytes);
    await processNext();
    expect(imageState(imageId).image!.processingStatus).toBe('ready');
    const result = readMediaMetadata(connection.db, imageId)!;
    expect(result).toMatchObject({
      status: 'succeeded',
      historical: false,
      error: null,
    });
    expect(result.readAt).toBeInstanceOf(Date);
    expect(result.attemptedAt).toBeInstanceOf(Date);
    const data = result.data!;
    expect(values(data, 'IFD0', 'Artist').sort()).toEqual(['first', 'second']);
    expect(values(data, 'XMP-tiff', 'Artist')).toEqual(['other-group']);
    expect(values(data, 'IFD0', 'ImageDescription')).toEqual(['1.10', '1.10']);
    expect(values(data, 'ExifIFD', 'SerialNumber')).toEqual([serial, serial]);
    expect(values(data, 'XMP-dc', 'Subject')).toEqual([['1.10', 'second']]);
    expect(values(data, 'XMP-mwg-rs', 'RegionInfo')).toEqual([
      {
        AppliedToDimensions: { W: '32', H: '16', Unit: 'pixel' },
        RegionList: [
          {
            Name: '1.10',
            Type: 'Face',
            Area: {
              X: '0.5',
              Y: '0.5',
              W: '0.2',
              H: '0.2',
              Unit: 'normalized',
            },
          },
        ],
      },
    ]);
    expect(values(data, 'GPS', 'GPSLatitude')).toEqual([
      expect.stringContaining('31 deg 12'),
      expect.stringContaining('31 deg 12'),
    ]);
    expect(values(data, 'GPS', 'GPSLongitude')).toEqual([
      expect.stringContaining('121 deg 30'),
      expect.stringContaining('121 deg 30'),
    ]);
    expect(Object.keys(data).some((key) => key.startsWith('ICC-header:'))).toBe(
      true,
    );
    expect(values(data, 'ICC_Profile', 'ProfileDescription')).toEqual([
      expect.stringContaining('sRGB'),
    ]);
    expect(values(data, 'Nikon', 'MakerNoteVersion')).toEqual(['1.00', '1.00']);
    expect(result.photography).toMatchObject({
      make: 'NIKON',
      model: 'E775',
      iso: 100,
      aperture: 9.4,
      focalLength: 8.6,
      exposureTime: '1/213',
    });
    expect(await versionBytes(imageId, 'original')).toEqual(bytes);

    for (const kind of ['compressed', 'thumbnail'] as const) {
      const derived = join(directory, kind);
      await writeFile(derived, await versionBytes(imageId, kind));
      const dimensions = await execa('magick', [
        'identify',
        '-format',
        '%wx%h',
        derived,
      ]);
      expect(dimensions.stdout).toBe('16x32');
      const { stdout } = await execa('exiftool', ['-json', '-G1', derived]);
      const [stripped] = JSON.parse(stdout) as Record<string, unknown>[];
      expect(
        Object.keys(stripped!).filter((key) =>
          /^(IFD0|ExifIFD|GPS|Nikon|XMP-|ICC)/.test(key),
        ),
      ).toEqual([]);
    }
    expect(await readdir(runtime.temporaryRoot)).toEqual([]);
  });

  it('rereads the accepted original without changing image state, versions, objects, or bytes', async () => {
    const bytes = await complexJpeg();
    const { imageId } = await accept(bytes);
    await processNext();
    const before = imageState(imageId);
    const oldReadAt = readMediaMetadata(connection.db, imageId)!.readAt!;
    const derived = await versionBytes(imageId, 'compressed');
    const request = requestMetadataRead(connection.db, imageId);
    expect(requestMetadataRead(connection.db, imageId)).toEqual(request);
    expect(readMediaMetadata(connection.db, imageId)).toMatchObject({
      status: 'queued',
      historical: true,
      readAt: oldReadAt,
    });
    const job = await processNext();
    expect(job).toMatchObject({ id: request.jobId, kind: 'metadata' });
    expect(readMediaMetadata(connection.db, imageId)).toMatchObject({
      status: 'succeeded',
      historical: false,
      error: null,
    });
    expect(
      readMediaMetadata(connection.db, imageId)!.readAt!.getTime(),
    ).toBeGreaterThan(oldReadAt.getTime());
    expect(imageState(imageId)).toEqual(before);
    expect(await versionBytes(imageId, 'original')).toEqual(bytes);
    expect(await versionBytes(imageId, 'compressed')).toEqual(derived);
  });

  it.each(['timeout', 'output'] as const)(
    'an initial complete-read %s failure does not invalidate reliable classification or ready versions',
    async (limit) => {
      const bytes = await complexJpeg();
      const { imageId } = await accept(bytes);
      const restricted = restrictCompleteRead(limit);
      await processNext();
      expect(imageState(imageId).image).toMatchObject({
        processingStatus: 'ready',
        classification: 'static',
        width: 32,
        height: 16,
      });
      expect(
        imageState(imageId)
          .versions.map((version) => version.kind)
          .sort(),
      ).toEqual(['compressed', 'original', 'thumbnail']);
      expect(readMediaMetadata(connection.db, imageId)).toMatchObject({
        status: 'failed',
        data: null,
        photography: null,
        readAt: null,
        historical: false,
        attemptedAt: expect.any(Date),
        error: expect.stringContaining('metadata:'),
      });
      expect(readMediaMetadata(connection.db, imageId)!.error).toContain(
        limit === 'timeout' ? 'MEDIA_TOOL_TIMEOUT' : 'maxBuffer',
      );
      expect(await versionBytes(imageId, 'original')).toEqual(bytes);
      expect(await readdir(runtime.temporaryRoot)).toEqual([]);

      const readyState = imageState(imageId);
      restricted.mockRestore();
      requestMetadataRead(connection.db, imageId);
      await processNext();
      expect(readMediaMetadata(connection.db, imageId)).toMatchObject({
        status: 'succeeded',
        historical: false,
        error: null,
        readAt: expect.any(Date),
        photography: { make: 'NIKON' },
      });
      expect(imageState(imageId)).toEqual(readyState);
    },
  );

  it.each(['timeout', 'output'] as const)(
    'a reread %s failure retains the last successful result and timestamp as history',
    async (limit) => {
      const { imageId } = await accept(await complexJpeg());
      await processNext();
      const before = readMediaMetadata(connection.db, imageId)!;
      const oldState = imageState(imageId);
      requestMetadataRead(connection.db, imageId);
      restrictCompleteRead(limit);
      const job = await processNext();
      expect(readMediaMetadata(connection.db, imageId)).toMatchObject({
        status: 'failed',
        historical: true,
        data: before.data,
        photography: before.photography,
        readAt: before.readAt,
        error: expect.stringContaining('metadata:'),
      });
      expect(
        readMediaMetadata(connection.db, imageId)!.attemptedAt!.getTime(),
      ).toBeGreaterThan(before.attemptedAt!.getTime());
      expect(
        connection.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.id, job.id))
          .get(),
      ).toMatchObject({ status: 'failed', step: 'metadata', retryCount: 0 });
      expect(imageState(imageId)).toEqual(oldState);
      expect(await readdir(runtime.temporaryRoot)).toEqual([]);
    },
  );

  it('does not report ready when persisting a successful initial extraction fails', async () => {
    const { imageId } = await accept(await complexJpeg());
    connection.db.$client.exec(
      `CREATE TRIGGER reject_metadata_success BEFORE UPDATE ON media_metadata WHEN NEW.status = 'succeeded' BEGIN SELECT RAISE(ABORT, 'injected metadata database write failure'); END`,
    );
    const job = await processNext();
    expect(imageState(imageId).image!.processingStatus).toBe('failed');
    expect(
      connection.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, job.id))
        .get(),
    ).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(
        'injected metadata database write failure',
      ),
    });
    expect(readMediaMetadata(connection.db, imageId)).toMatchObject({
      status: 'failed',
      data: null,
      readAt: null,
      error: expect.stringContaining(
        'injected metadata database write failure',
      ),
    });
  });

  it('retains the ExifTool empty-file diagnosis without logging full metadata and keeps the previous result', async () => {
    const { imageId } = await accept(await complexJpeg());
    await processNext();
    const before = readMediaMetadata(connection.db, imageId)!;
    const logs: string[] = [];
    runtime.logger = createRuntimeLogger('metadata.test', 'info', {
      write: (message) => {
        logs.push(message);
      },
    });
    await writeFile(originalPath(imageId), Buffer.alloc(0));
    requestMetadataRead(connection.db, imageId);
    const job = await processNext();
    const failed = readMediaMetadata(connection.db, imageId)!;
    expect(failed).toMatchObject({
      status: 'failed',
      historical: true,
      data: before.data,
      photography: before.photography,
      readAt: before.readAt,
    });
    expect.soft(failed.error).toContain('File is empty');
    expect.soft(logs.join('')).toContain('File is empty');
    expect
      .soft(
        connection.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.id, job.id))
          .get(),
      )
      .toMatchObject({
        status: 'failed',
        error: expect.stringContaining('File is empty'),
      });
    const diagnostics = `${failed.error}\n${logs.join('')}`;
    for (const privateValue of [
      serial,
      'GPS:Main:GPSLatitude',
      '31 deg 12',
      'ExifTool:Main:ExifToolVersion',
      '"stdout"',
      '"stderr"',
    ]) {
      expect(diagnostics).not.toContain(privateValue);
    }
    expect(imageState(imageId).image!.processingStatus).toBe('ready');
    expect(await readdir(runtime.temporaryRoot)).toEqual([]);
  });

  it('rechecks storage disabled during workspace preparation before accessing the original', async () => {
    const { imageId } = await accept(await complexJpeg());
    await processNext();
    const before = readMediaMetadata(connection.db, imageId)!;
    await rm(originalPath(imageId));
    requestMetadataRead(connection.db, imageId);
    const job = claimNextMediaJob(connection.db)!;
    const pending = processMetadataJob(runtime, job.id);
    // The worker has read the enabled configuration, then yielded for workspace I/O.
    // Disabling the real row now must prevent even an attempted read of the missing file.
    queueMicrotask(() =>
      connection.db.update(storageConfigs).set({ enabled: false }).run(),
    );
    await pending;
    const failed = readMediaMetadata(connection.db, imageId)!;
    expect(failed).toMatchObject({
      status: 'failed',
      historical: true,
      data: before.data,
      photography: before.photography,
      readAt: before.readAt,
    });
    expect.soft(failed.error).toContain('STORAGE_DISABLED');
    expect.soft(failed.error).not.toContain('STORAGE_OBJECT_MISSING');
    expect(
      connection.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, job.id))
        .get(),
    ).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('STORAGE_DISABLED'),
    });
    expect(await readdir(runtime.temporaryRoot)).toEqual([]);
  });

  it('atomically retains the previous metadata if marking a reread job succeeded fails and later recovers', async () => {
    const { imageId } = await accept(await complexJpeg());
    await processNext();
    const before = readMediaMetadata(connection.db, imageId)!;
    const oldState = imageState(imageId);
    await execa('exiftool', [
      '-overwrite_original',
      '-EXIF:Make=RecoveryCamera',
      originalPath(imageId),
    ]);
    connection.db.$client.exec(
      `CREATE TRIGGER reject_metadata_job_success BEFORE UPDATE ON media_jobs WHEN NEW.kind = 'metadata' AND NEW.status = 'succeeded' BEGIN SELECT RAISE(ABORT, 'injected metadata job success failure'); END`,
    );
    requestMetadataRead(connection.db, imageId);
    const job = await processNext();
    const failed = readMediaMetadata(connection.db, imageId)!;
    expect(failed).toMatchObject({
      status: 'failed',
      historical: true,
      error: expect.stringContaining('injected metadata job success failure'),
    });
    expect.soft(failed.data).toEqual(before.data);
    expect.soft(failed.photography).toEqual(before.photography);
    expect.soft(failed.readAt).toEqual(before.readAt);
    expect(
      connection.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, job.id))
        .get(),
    ).toMatchObject({ status: 'failed' });
    expect(imageState(imageId)).toEqual(oldState);

    connection.db.$client.exec('DROP TRIGGER reject_metadata_job_success');
    requestMetadataRead(connection.db, imageId);
    const recoveredJob = await processNext();
    const recovered = readMediaMetadata(connection.db, imageId)!;
    expect(recovered).toMatchObject({
      status: 'succeeded',
      historical: false,
      error: null,
      photography: { make: 'RecoveryCamera' },
    });
    expect(values(recovered.data!, 'IFD0', 'Make')).toContain('RecoveryCamera');
    expect(recovered.readAt!.getTime()).toBeGreaterThan(
      before.readAt!.getTime(),
    );
    expect(
      connection.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, recoveredJob.id))
        .get(),
    ).toMatchObject({ status: 'succeeded', error: null });
    expect(imageState(imageId)).toEqual(oldState);
    expect(await readdir(runtime.temporaryRoot)).toEqual([]);
  });
});
