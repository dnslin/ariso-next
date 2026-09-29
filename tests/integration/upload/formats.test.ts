import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  createSubmission,
  getSession,
} from '../../../src/server/upload/sessions.ts';
import { receiveSession } from '../../../src/server/upload/receive.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { processMediaJob } from '../../../src/server/media/process.ts';
import { getImageAccessState } from '../../../src/server/media/images.ts';
import manifest from '../../fixtures/media-formats/manifest.json';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  fixture.close();
});
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

async function upload(bytes: Buffer) {
  const submission = createSubmission(fixture.db, {
    requestId: 'formats',
    albumIds: [],
    files: [
      {
        queueItemId: 'file',
        originalName: 'incorrect.jpg',
        declaredMime: 'image/jpeg',
        declaredSize: bytes.length,
      },
    ],
  });
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
    'incorrect.jpg',
  );
  const accepted = await receiveSession(
    fixture,
    submission.sessions[0].id,
    new Request('http://localhost/api/uploads/content', {
      method: 'POST',
      body: form,
    }),
    new AbortController().signal,
  );
  expect(accepted.state).toBe('accepted');
  return accepted;
}

async function processNext() {
  const job = claimNextMediaJob(fixture.db)!;
  expect(job).not.toBeNull();
  await processMediaJob(
    {
      ...fixture,
      temporaryRoot: join(fixture.storageRoot, 'processing-tmp'),
      logger: { info() {}, error() {} },
    },
    job.id,
  );
}

async function originalBytes(imageId: string) {
  const original = getImageAccessState(fixture.db, imageId)!.versions.find(
    (v) => v.kind === 'original',
  )!.saved!;
  return readFile(
    join(
      fixture.storageRoot,
      fixture.storage.localPath,
      'ariso',
      fixture.storage.id,
      original.object.key,
    ),
  );
}

describe('full-format upload to persistent media processing', () => {
  const samples = manifest.samples.filter((sample) =>
    ['animated-png', 'alpha-heic', 'static-svg'].includes(sample.id),
  );
  it.each(samples)(
    '$id is identified from bytes, accepted and processed to ready',
    async (sample) => {
      const bytes = await readFile(
        join('tests/fixtures/media-formats', sample.file),
      );
      expect(hash(bytes)).toBe(sample.sha256);
      const accepted = await upload(bytes);
      const before = getImageAccessState(fixture.db, accepted.imageId!)!;
      const classification =
        sample.expected.classification === 'animation'
          ? 'animated'
          : sample.expected.classification === 'static'
            ? 'static'
            : 'preview_only';
      expect(before.image).toMatchObject({
        classification: null,
        processingStatus: 'pending',
        format: sample.expected.format,
      });
      expect(hash(await originalBytes(accepted.imageId!))).toBe(sample.sha256);
      await processNext();
      const state = getImageAccessState(fixture.db, accepted.imageId!)!;
      expect(state.latestJob).toMatchObject({
        status: 'succeeded',
        error: null,
      });
      expect(state.image).toMatchObject({
        classification,
        processingStatus: 'ready',
      });
      expect(state.versions.find((v) => v.kind === 'thumbnail')).toMatchObject({
        applicable: true,
        status: 'saved',
      });
      expect(state.versions.find((v) => v.kind === 'compressed')).toMatchObject(
        {
          applicable: classification === 'static',
          status: classification === 'static' ? 'saved' : 'not_applicable',
        },
      );
      expect(
        state.versions.find((v) => v.kind === 'thumbnail')!.saved!.version.mime,
      ).toBe('image/webp');
      expect(hash(await originalBytes(accepted.imageId!))).toBe(sample.sha256);
      expect(getSession(fixture.db, accepted.id).state).toBe('accepted');
    },
  );

  it('accepts dangerous SVG original then records preview failure without losing original bytes', async () => {
    const bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><image href="file:///etc/passwd"/></svg>',
    );
    const accepted = await upload(bytes);
    expect(
      getImageAccessState(fixture.db, accepted.imageId!)!.image.classification,
    ).toBeNull();
    await processNext();
    const state = getImageAccessState(fixture.db, accepted.imageId!)!;
    expect(state.image).toMatchObject({
      classification: 'preview_only',
      processingStatus: 'failed',
    });
    expect(state.latestJob?.error).toContain('SVG external resource');
    expect(state.versions.find((v) => v.kind === 'thumbnail')).toMatchObject({
      applicable: true,
      status: 'failed',
      saved: null,
    });
    expect(state.versions.filter((v) => v.saved).map((v) => v.kind)).toEqual([
      'original',
    ]);
    expect(await originalBytes(accepted.imageId!)).toEqual(bytes);
    expect(getSession(fixture.db, accepted.id).state).toBe('accepted');
  });
});
