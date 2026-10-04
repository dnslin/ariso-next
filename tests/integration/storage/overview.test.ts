import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { collectionFixture } from '../collections/helpers.ts';
import { readStorageOverview } from '../../../src/server/startup/storage-overview.ts';
import { readStorageReferences } from '../../../src/server/startup/storage-references.ts';
import { mediaObjects } from '../../../src/server/media/schema.ts';
import {
  storageOrphans,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import type { ConnectionReport } from '../../../src/server/storage/probe-types.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

it('returns observed zero for an empty initialized storage without inventing remote capacity', () => {
  const rows = readStorageOverview(fixture.db, readStorageReferences);
  expect(rows).toHaveLength(1);
  expect(rows[0].usage).toEqual({ knownBytes: 0, unconfirmedObjects: 0 });
  expect(rows[0]).not.toHaveProperty('accessKeyEncrypted');
});

it('combines real media, probes and orphan bytes without counting owned orphan rows twice', () => {
  const imageId = fixture.image();
  const original = fixture.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.imageId, imageId))
    .all()
    .find((object) => object.status === 'stored')!;
  fixture.db
    .insert(storageOrphans)
    .values([
      {
        storageId: fixture.storage.id,
        key: original.key,
        size: 100,
        confirmedAt: new Date(),
        error: null,
      },
      {
        storageId: fixture.storage.id,
        key: 'unowned',
        size: 200,
        confirmedAt: new Date(),
        error: null,
      },
    ])
    .run();
  const probeId = randomUUID();
  const report: ConnectionReport = {
    probeId,
    storageId: fixture.storage.id,
    revision: 1,
    passed: false,
    stale: false,
    cleanupPending: true,
    stages: [],
    deploymentRequirement: '',
    testedAt: new Date().toISOString(),
    ownerConfirmation: { wholeBucketHasNoLockRules: false, confirmedAt: null },
  };
  fixture.db
    .insert(storageProbes)
    .values({
      id: probeId,
      storageId: fixture.storage.id,
      purpose: 'connection',
      configRevision: 1,
      key: `probes/${probeId}`,
      state: 'cleanup',
      stage: 'delete',
      objectState: 'stored',
      byteSize: 23,
      report,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  expect(
    readStorageOverview(fixture.db, readStorageReferences)[0].usage,
  ).toEqual({ knownBytes: 323, unconfirmedObjects: 0 });
  fixture.db
    .update(storageProbes)
    .set({ objectState: 'writing', byteSize: null })
    .where(eq(storageProbes.id, probeId))
    .run();
  expect(
    readStorageOverview(fixture.db, readStorageReferences)[0].usage,
  ).toEqual({ knownBytes: 300, unconfirmedObjects: 1 });
});
