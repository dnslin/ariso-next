import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
  writeObject,
  inspectObject,
  deleteObject,
} from '../../../src/server/storage/local.ts';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { acceptSession } from '../../../src/server/upload/accept.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import {
  mediaObjects,
  mediaImages,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { trashImage, restoreImage } from '../../../src/server/media/trash.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  aggregateUsage,
  readUsageObjects,
  createExperimentResponsibilityTable,
  recordExperimentObject,
  type UsageObject,
} from '../../experiments/analytics-usage/usage.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
  createExperimentResponsibilityTable(fixture.db.$client);
});
afterEach(() => fixture.close());
const facts: Parameters<typeof acceptSession>[2] = {
  format: 'PNG',
  mime: 'image/png',
  extension: 'png',
  coder: 'png',
  width: 1,
  height: 1,
};
const usage = () => aggregateUsage(readUsageObjects(fixture.db.$client));
function record(overrides: Partial<UsageObject>) {
  const value: UsageObject = {
    storageId: fixture.storage.id,
    key: randomUUID(),
    owner: 'storage',
    group: 'pending',
    state: 'stored',
    confirmedBytes: 11,
    confirmedAt: Date.now(),
    ...overrides,
  };
  recordExperimentObject(fixture.db.$client, value);
  return value;
}

describe('EV-ANALYTICS-02 disk SQLite object responsibility experiment', () => {
  it('commits real upload→media responsibility once and rolls all owners back on failure', async () => {
    const { db } = fixture;
    const submission = createSubmission(db, {
      requestId: 'usage-upload',
      files: [
        { queueItemId: 'file', originalName: 'one.png', declaredSize: 20 },
      ],
    });
    const session = submission.sessions[0];
    db.update(uploadSessions)
      .set({ state: 'finalizing', finalKey: 'original/one.png', byteSize: 20 })
      .where(eq(uploadSessions.id, session.id))
      .run();
    await writeObject(
      fixture.storageRoot,
      fixture.storage,
      { key: 'original/one.png', temporaryKey: 'uploads/one.partial' },
      Readable.from(Buffer.alloc(20, 42)),
    );
    expect(
      (
        await inspectObject(
          fixture.storageRoot,
          fixture.storage,
          'original/one.png',
        )
      )?.size,
    ).toBe(20);
    const before = usage();
    expect(before[0]).toMatchObject({ knownBytes: 0, pendingObjects: 1 });
    db.$client.exec(
      "CREATE TRIGGER fail_usage_accept BEFORE UPDATE OF state ON upload_sessions WHEN NEW.state='accepted' BEGIN SELECT RAISE(ABORT,'usage injected handoff failure'); END",
    );
    expect(() => acceptSession(db, session.id, facts)).toThrow(
      'usage injected handoff failure',
    );
    expect(db.select().from(mediaImages).all()).toHaveLength(0);
    expect(usage()).toEqual(before);
    db.$client.exec('DROP TRIGGER fail_usage_accept');
    acceptSession(db, session.id, facts);
    expect(usage()[0]).toMatchObject({
      knownBytes: 20,
      pendingObjects: 0,
      groups: { original: 20, pending: 0 },
    });
    expect(db.select().from(mediaObjects).all()).toHaveLength(1);
    // Historical accepted audit identity contributes nothing; retained temporary responsibility does.
    db.update(uploadSessions)
      .set({
        finalKey: 'original/one.png',
        temporaryKey: 'uploads/leftover.partial',
      })
      .where(eq(uploadSessions.id, session.id))
      .run();
    expect(usage()[0]).toMatchObject({ knownBytes: 20, pendingObjects: 1 });
    const temporary = record({
      owner: 'upload',
      key: 'uploads/leftover.partial',
      confirmedBytes: 7,
    });
    expect(usage()[0]).toMatchObject({ knownBytes: 27, pendingObjects: 0 });
    recordExperimentObject(db.$client, {
      ...temporary,
      state: 'cleanup_failed',
    });
    expect(usage()[0].knownBytes).toBe(27);
    recordExperimentObject(db.$client, { ...temporary, state: 'deleted' });
    expect(usage()[0]).toMatchObject({ knownBytes: 20, pendingObjects: 0 });
  });

  it('moves all media objects on trash/restore, keeps failed cleanup, removes only confirmed deletion', async () => {
    const { db } = fixture;
    const imageId = fixture.image();
    const original = db.select().from(mediaObjects).get()!;
    for (const [status, byteSize] of [
      ['stored', 13],
      ['cleanup_failed', 17],
      ['writing', 99],
      ['planned', 99],
    ] as const) {
      db.insert(mediaObjects)
        .values({
          ...original,
          id: randomUUID(),
          key: `objects/${status}`,
          purpose: 'thumbnail',
          status,
          byteSize,
        })
        .run();
    }
    expect(usage()[0]).toMatchObject({
      knownBytes: 130,
      pendingObjects: 1,
      groups: { original: 100, pending: 30 },
    });
    trashImage(db, imageId);
    expect(usage()[0]).toMatchObject({
      knownBytes: 130,
      pendingObjects: 1,
      groups: { recycle: 130, original: 0, pending: 0 },
    });
    db.update(storageConfigs).set({ enabled: false }).run();
    restoreImage(db, imageId);
    expect(usage()[0]).toMatchObject({
      knownBytes: 130,
      groups: { original: 100, pending: 30 },
    });
    await writeObject(
      fixture.storageRoot,
      fixture.storage,
      {
        key: 'objects/cleanup_failed',
        temporaryKey: 'objects/cleanup.partial',
      },
      Readable.from(Buffer.alloc(17, 42)),
    );
    expect(
      (
        await inspectObject(
          fixture.storageRoot,
          fixture.storage,
          'objects/cleanup_failed',
        )
      )?.size,
    ).toBe(17);
    await deleteObject(
      fixture.storageRoot,
      fixture.storage,
      'objects/cleanup_failed',
    );
    await expect(
      inspectObject(
        fixture.storageRoot,
        fixture.storage,
        'objects/cleanup_failed',
      ),
    ).resolves.toBeNull();
    db.update(mediaObjects)
      .set({ status: 'deleted' })
      .where(eq(mediaObjects.key, 'objects/cleanup_failed'))
      .run();
    expect(usage()[0].knownBytes).toBe(113);
  });

  it('deduplicates provider and version identities, excludes planned, preserves unknown, and separates storage IDs', () => {
    const imageId = fixture.image();
    const original = fixture.db.select().from(mediaObjects).get()!;
    const derivedId = randomUUID();
    fixture.db
      .insert(mediaObjects)
      .values({
        ...original,
        id: derivedId,
        key: 'current/thumbnail',
        purpose: 'thumbnail',
        byteSize: 4,
      })
      .run();
    fixture.db
      .insert(mediaVersions)
      .values({
        imageId,
        kind: 'thumbnail',
        objectId: derivedId,
        byteSize: 4,
        format: 'PNG',
        mime: 'image/png',
        createdAt: new Date(),
      })
      .run();
    record({ key: original.key, confirmedBytes: 100 }); // discovered orphan is now owned by media
    record({ key: 'probe', confirmedBytes: 3 });
    record({ key: 'orphan', confirmedBytes: 5 });
    record({ key: 'planned', state: 'planned', confirmedBytes: 999 });
    record({ key: 'writing', state: 'writing', confirmedBytes: 999 });
    record({ key: 'unknown', confirmedBytes: null });
    record({
      key: 'owned-in-flight',
      owner: 'media',
      state: 'writing',
      confirmedBytes: null,
    });
    record({
      key: 'owned-in-flight',
      owner: 'storage',
      state: 'stored',
      confirmedBytes: 999,
      confirmedAt: Date.now() + 1,
    });
    record({
      storageId: 'another-storage',
      key: original.key,
      confirmedBytes: 9,
    });
    const normal = usage();
    expect(
      normal.find((s) => s.storageId === fixture.storage.id),
    ).toMatchObject({
      knownBytes: 112,
      pendingObjects: 3,
      groups: { original: 100, derived: 4, pending: 8 },
    });
    expect(
      normal.find((s) => s.storageId === 'another-storage')?.knownBytes,
    ).toBe(9);
    trashImage(fixture.db, imageId);
    const recycled = usage();
    expect(
      recycled.find((s) => s.storageId === fixture.storage.id),
    ).toMatchObject({
      knownBytes: 112,
      groups: { recycle: 104, original: 0, derived: 0, pending: 8 },
    });
    if (process.env.ARISO_USAGE_EVIDENCE) {
      mkdirSync(process.env.ARISO_USAGE_EVIDENCE, { recursive: true });
      writeFileSync(
        join(process.env.ARISO_USAGE_EVIDENCE, 'usage.json'),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            node: process.version,
            database:
              'disk SQLite WAL migrated production schema plus explicitly experimental responsibility table',
            normal,
            recycled,
            limitations: [
              'No production S3/probe/orphan provider yet',
              'Upload finalizing keys remain unknown until provider confirms; progress byte_size is not proof of object existence',
              'Fixture metadata exercises production acceptance transaction; does not claim HTTP upload or remote scanning',
            ],
          },
          null,
          2,
        ) + '\n',
      );
    }
  });
});
