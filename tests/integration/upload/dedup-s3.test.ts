import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createS3UploadFixture,
  uploadOrigin,
  uploadRequest,
} from './s3-fixture.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { readUploadUsage } from '../../../src/server/upload/usage.ts';

vi.mock('../../../src/server/media/file-formats.ts', () => ({
  identifyImageFile: vi.fn(async () => ({
    format: 'PNG',
    mime: 'image/png',
    extension: 'png',
    coder: 'png',
    width: 64,
    height: 48,
    identificationTags: {},
  })),
}));
let fixture: Awaited<ReturnType<typeof createS3UploadFixture>>;
beforeEach(async () => {
  fixture = await createS3UploadFixture();
});
afterEach(async () => {
  await fixture?.close();
});
async function direct() {
  const session = fixture.submission().sessions[0];
  const begun = await fixture.runtime.begin(session.id, uploadOrigin);
  const response = await fetch(begun.upload!.url, {
    method: begun.upload!.method,
    headers: begun.upload!.headers,
    body: new Uint8Array(fixture.bytes),
  });
  expect(response.ok).toBe(true);
  return fixture.runtime.complete(session.id);
}

it('uses raw bytes across S3 direct and relay uploads and retains an idempotent duplicate result', async () => {
  const first = await direct();
  const duplicate = await direct();
  expect(duplicate).toMatchObject({
    state: 'duplicate',
    existingImageId: first.imageId,
    cleanupStatus: 'none',
    imageId: null,
  });
  expect(await fixture.runtime.complete(duplicate.id)).toMatchObject({
    state: 'duplicate',
    existingImageId: first.imageId,
  });
  const relay = fixture.submission().sessions[0];
  expect(
    await fixture.runtime.receive(relay.id, uploadRequest(fixture.bytes)),
  ).toMatchObject({
    state: 'duplicate',
    existingImageId: first.imageId,
    cleanupStatus: 'none',
  });
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaObjects).get()?.contentSha256).toBe(
    createHash('sha256').update(fixture.bytes).digest('hex'),
  );
  expect(fixture.endpoint.objects.size).toBe(1);
  expect(readUploadUsage(fixture.db)).toEqual([]);
});

it('cleans a losing S3 candidate after concurrent direct completions', async () => {
  const results = await Promise.all([direct(), direct()]);
  expect(results.map((result) => result.state).sort()).toEqual([
    'accepted',
    'duplicate',
  ]);
  expect(fixture.endpoint.objects.size).toBe(1);
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
  expect(readUploadUsage(fixture.db)).toEqual([]);
});
