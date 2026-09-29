import { requireLocalStorage } from '../server/storage/settings.ts';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { execa } from 'execa';
import { openRuntimeDatabase } from '../server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
  readObject,
} from '../server/storage/local.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../server/media/settings.ts';
import { acceptOriginal, getImageAccessState } from '../server/media/images.ts';
import { processMediaJob } from '../server/media/process.ts';
import { claimNextMediaJob } from '../server/media/queue.ts';

type Sample = {
  id: string;
  file: string;
  sha256: string;
  expected: { classification: string };
  preview: {
    width: number;
    height: number;
    pixels: { x: number; y: number; rgba: number[]; tolerance?: number }[];
  };
};

/** Runs the actual persisted pipeline in the packaged runtime, using isolated data. */
export async function verifyMediaFormats(fixtures: string, output: string) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-verify-media-'));
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const checks: { id: string; status: string; error?: string }[] = [];
  try {
    await mkdir(join(directory, 'storage'));
    await mkdir(join(directory, 'tmp'));
    await mkdir(output, { recursive: true });
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    prepareInitialStorage(connection.db, {
      storage: join(directory, 'storage'),
    });
    connection.db.transaction(prepareInitialMedia);
    const runtime = {
      db: connection.db,
      storageRoot: join(directory, 'storage'),
      temporaryRoot: join(directory, 'tmp'),
      logger: { info() {}, error() {} },
    };
    const { samples } = JSON.parse(
      await readFile(join(fixtures, 'manifest.json'), 'utf8'),
    ) as { samples: Sample[] };
    for (const sample of samples) {
      try {
        const bytes = await readFile(join(fixtures, sample.file));
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          sample.sha256,
        );
        const storage = resolveUploadStorage(connection.db);
        requireLocalStorage(storage);
        const plan = planLocalWrite('verification');
        await writeObject(
          runtime.storageRoot,
          storage,
          plan,
          Readable.from(bytes),
        );
        const snapshot = connection.db.transaction(createProcessingSnapshot);
        const accepted = connection.db.transaction((tx) =>
          acceptOriginal(tx, {
            imageId: randomUUID(),
            storageId: storage.id,
            key: plan.key,
            originalName: sample.file,
            visibility: 'private',
            format: 'unknown',
            mime: 'application/octet-stream',
            byteSize: bytes.length,
            snapshot,
            expectedVersions: ['compressed', 'thumbnail'],
          }),
        );
        const job = claimNextMediaJob(connection.db)!;
        await processMediaJob(runtime, job.id);
        const state = getImageAccessState(connection.db, accepted.imageId)!;
        assert.equal(
          state.latestJob?.status,
          'succeeded',
          state.latestJob?.error ?? sample.id,
        );
        assert.equal(
          state.image.classification,
          sample.expected.classification === 'animation'
            ? 'animated'
            : sample.expected.classification === 'static'
              ? 'static'
              : 'preview_only',
        );
        assert.deepEqual(
          state.versions.filter((v) => v.saved).map((v) => v.kind),
          sample.expected.classification === 'static'
            ? ['original', 'compressed', 'thumbnail']
            : ['original', 'thumbnail'],
        );
        for (const kind of ['original', 'thumbnail'] as const) {
          const saved = state.versions.find((v) => v.kind === kind)!.saved!;
          const data = await readObject(
            runtime.storageRoot,
            storage,
            saved.object.key,
            saved.version.mime,
          );
          const chunks: Buffer[] = [];
          for await (const chunk of data.stream)
            chunks.push(Buffer.from(chunk));
          const content = Buffer.concat(chunks);
          if (kind === 'original') {
            assert.deepEqual(content, bytes);
            continue;
          }
          assert.equal(saved.version.mime, 'image/webp');
          assert.equal(saved.version.width, sample.preview.width);
          assert.equal(saved.version.height, sample.preview.height);
          const { stdout } = await execa(
            'magick',
            ['webp:-', '-depth', '8', 'rgba:-'],
            { input: content, encoding: 'buffer' },
          );
          assert.equal(
            stdout.length,
            sample.preview.width * sample.preview.height * 4,
          );
          for (const pixel of sample.preview.pixels)
            for (let channel = 0; channel < 4; channel++) {
              if (channel < 3 && pixel.rgba[3] === 0) continue;
              const actual =
                stdout[
                  (pixel.y * sample.preview.width + pixel.x) * 4 + channel
                ];
              assert.ok(
                Math.abs(actual - pixel.rgba[channel]) <=
                  (pixel.tolerance ?? 20),
                `${sample.id} pixel ${pixel.x},${pixel.y}`,
              );
            }
          await writeFile(join(output, `${sample.id}.webp`), content);
        }
        checks.push({ id: sample.id, status: 'passed' });
      } catch (error) {
        checks.push({
          id: sample.id,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await writeFile(
      join(output, 'report.json'),
      JSON.stringify(
        {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          checks,
        },
        null,
        2,
      ) + '\n',
    );
    assert.ok(
      checks.length > 0 && checks.every((c) => c.status === 'passed'),
      JSON.stringify(checks.filter((c) => c.status === 'failed')),
    );
    return checks;
  } finally {
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
}
