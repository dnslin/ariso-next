import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAlbum,
  deleteAlbum,
  getOrCreateTags,
} from '../../../src/server/collections/records.ts';
import {
  albumImages,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  mediaSettings,
} from '../../../src/server/media/schema.ts';
import { readMediaInput } from '../../../src/server/media/input.ts';
import {
  cleanupSession,
  expireUploadSessions,
  recoverUploadSessions,
  purgeUploadResults,
} from '../../../src/server/upload/cleanup.ts';
import {
  uploadSessions,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import {
  createSubmission,
  getPreparedSession,
  getSession,
  getSubmission,
} from '../../../src/server/upload/sessions.ts';
import { storageSettings } from '../../../src/server/storage/schema.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
import {
  readUploadReferences,
  readUploadUsage,
} from '../../../src/server/upload/usage.ts';
import {
  createS3UploadFixture,
  uploadOrigin,
  uploadRequest,
} from './s3-fixture.ts';

let fixture: Awaited<ReturnType<typeof createS3UploadFixture>>;
beforeEach(async () => {
  fixture = await createS3UploadFixture();
});
afterEach(async () => {
  await fixture.close();
});

async function direct(
  bytes = fixture.bytes,
  session = fixture.submission().sessions[0],
) {
  const begun = await fixture.runtime.begin(session.id, uploadOrigin);
  expect(begun.route).toBe('direct');
  expect(begun.upload).toBeDefined();
  const response = await fetch(begun.upload!.url, {
    method: begun.upload!.method,
    headers: begun.upload!.headers,
    body: new Uint8Array(bytes),
  });
  expect(response.status).toBe(200);
  return getPreparedSession(fixture.db, session.id);
}
function assertNoAssets() {
  for (const table of [mediaImages, mediaJobs, mediaVersions, mediaObjects])
    expect(fixture.db.select().from(table).all()).toHaveLength(0);
}

describe('S3 upload routing and handoff through real SDK HTTP', () => {
  it('resubmits an expired direct session with frozen settings and relationships, new identity and idempotent request IDs', async () => {
    const album = fixture.db.transaction((tx) =>
      createAlbum(tx, { name: 'frozen' }),
    );
    const [tag] = fixture.db.transaction((tx) =>
      getOrCreateTags(tx, ['frozen']),
    );
    const old = await direct(
      fixture.bytes,
      fixture.submission({ albumIds: [album.id], tagIds: [tag.id] })
        .sessions[0],
    );
    const frozen = getSubmission(fixture.db, old.submissionId);
    fixture.db
      .update(uploadSessions)
      .set({ signatureExpiresAt: new Date(0) })
      .where(eq(uploadSessions.id, old.id))
      .run();
    fixture.db
      .update(uploadSettings)
      .set({ maxFileBytes: 1, batchSize: 1, queueLimit: 100 })
      .run();
    fixture.db
      .update(mediaSettings)
      .set({ quality: 33, defaultVisibility: 'private' })
      .run();
    fixture.db
      .update(storageSettings)
      .set({ defaultStorageId: fixture.storage.id })
      .run();
    const replacement = await fixture.runtime.resubmit(old.id, 'resubmit-1');
    expect(replacement).toMatchObject({
      storageId: frozen.storageId,
      visibility: frozen.visibility,
      snapshot: frozen.snapshot,
      albumIds: frozen.albumIds,
      tagIds: frozen.tagIds,
      maxFileBytes: frozen.maxFileBytes,
      batchSize: frozen.batchSize,
      queueLimit: frozen.queueLimit,
      requestId: 'resubmit-1',
      requestInput: JSON.stringify({
        requestId: 'resubmit-1',
        previousSessionId: old.id,
      }),
    });
    expect(replacement.id).not.toBe(frozen.id);
    const next = replacement.sessions[0];
    expect(replacement.sessions).toHaveLength(1);
    expect(next).toMatchObject({
      state: 'queued',
      groupIndex: 0,
      queueItemId: old.queueItemId,
      originalName: old.originalName,
      declaredSize: old.declaredSize,
      declaredMime: old.declaredMime,
      storageId: old.storageId,
      route: null,
      temporaryKey: null,
      finalKey: null,
      signatureExpiresAt: null,
    });
    expect(next.id).not.toBe(old.id);
    expect(next.candidateImageId).not.toBe(old.candidateImageId);
    expect(next.candidateJobId).not.toBe(old.candidateJobId);
    expect(getSession(fixture.db, old.id)).toMatchObject({
      state: 'cancelled',
      cleanupStatus: 'none',
      temporaryKey: null,
    });
    expect(fixture.endpoint.objects.size).toBe(0);
    expect((await fixture.runtime.resubmit(old.id, 'resubmit-1')).id).toBe(
      replacement.id,
    );
    expect(fixture.db.select().from(uploadSubmissions).all()).toHaveLength(2);
    expect(fixture.db.select().from(uploadSessions).all()).toHaveLength(2);
    await expect(
      fixture.runtime.resubmit(old.id, 'resubmit-2'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      fixture.runtime.resubmit(next.id, 'resubmit-1'),
    ).rejects.toMatchObject({ code: 'UPLOAD_REQUEST_CONFLICT' });
    assertNoAssets();
    purgeUploadResults(fixture.db, new Date(Date.now() + 86_400_001));
    expect((await fixture.runtime.resubmit(old.id, 'resubmit-1')).id).toBe(
      replacement.id,
    );
    expect(fixture.db.select().from(uploadSessions).all()).toHaveLength(1);
  });

  it('resubmits a signature within ten seconds of expiry and retains cleanup failure for bounded retry', async () => {
    const old = await direct();
    fixture.db
      .update(uploadSessions)
      .set({ signatureExpiresAt: new Date(Date.now() + 9000) })
      .where(eq(uploadSessions.id, old.id))
      .run();
    fixture.endpoint.faults.delete = true;
    const replacement = await fixture.runtime.resubmit(old.id, 'near-expiry');
    expect(replacement.sessions[0].state).toBe('queued');
    expect(getSession(fixture.db, old.id)).toMatchObject({
      state: 'cancelled',
      cleanupStatus: 'pending',
      cleanupAttempts: 1,
      temporaryKey: old.temporaryKey,
    });
    expect(getSession(fixture.db, old.id).error).toContain(
      'Injected upload fixture failure',
    );
    expect((await fixture.runtime.resubmit(old.id, 'near-expiry')).id).toBe(
      replacement.id,
    );
    expect(getSession(fixture.db, old.id).cleanupAttempts).toBe(1);
    fixture.endpoint.faults.delete = false;
    await fixture.runtime.retryCleanup(old.id);
    expect(fixture.endpoint.objects.size).toBe(0);
  });

  it.each([
    'valid-signature',
    'relay',
    'cancelled',
    'failed',
    'expired',
  ] as const)('does not resubmit %s sessions', async (kind) => {
    if (kind === 'relay') fixture.cors({ corsStatus: 'failed' });
    const old = fixture.submission().sessions[0];
    await fixture.runtime.begin(old.id, uploadOrigin);
    if (kind !== 'valid-signature')
      fixture.db
        .update(uploadSessions)
        .set({
          signatureExpiresAt: new Date(0),
          ...(kind === 'cancelled' || kind === 'failed' || kind === 'expired'
            ? { state: kind }
            : {}),
        })
        .where(eq(uploadSessions.id, old.id))
        .run();
    const before = getSession(fixture.db, old.id);
    await expect(
      fixture.runtime.resubmit(old.id, 'rejected'),
    ).rejects.toMatchObject({ status: 409 });
    expect(getSession(fixture.db, old.id)).toEqual(before);
    expect(fixture.db.select().from(uploadSubmissions).all()).toHaveLength(1);
    expect(fixture.db.select().from(uploadSessions).all()).toHaveLength(1);
  });

  it('rechecks frozen collection targets before resubmission and rolls back cancellation on failure', async () => {
    const album = fixture.db.transaction((tx) =>
      createAlbum(tx, { name: 'selected' }),
    );
    const old = await direct(
      fixture.bytes,
      fixture.submission({ albumIds: [album.id] }).sessions[0],
    );
    fixture.db
      .update(uploadSessions)
      .set({ signatureExpiresAt: new Date(0) })
      .where(eq(uploadSessions.id, old.id))
      .run();
    fixture.db.transaction((tx) => deleteAlbum(tx, album.id));
    await expect(
      fixture.runtime.resubmit(old.id, 'target-removed'),
    ).rejects.toMatchObject({ code: 'COLLECTION_TARGET_NOT_FOUND' });
    expect(getSession(fixture.db, old.id)).toMatchObject({
      state: 'receiving',
      temporaryKey: old.temporaryKey,
    });
    expect(fixture.db.select().from(uploadSubmissions).all()).toHaveLength(1);
    expect(fixture.endpoint.objects.has(fixture.path(old.temporaryKey!))).toBe(
      true,
    );
  });

  it('does not resubmit a disabled target or an active complete operation', async () => {
    const old = await direct();
    fixture.db
      .update(uploadSessions)
      .set({ signatureExpiresAt: new Date(0) })
      .where(eq(uploadSessions.id, old.id))
      .run();
    fixture.cors({ enabled: false });
    await expect(
      fixture.runtime.resubmit(old.id, 'disabled'),
    ).rejects.toMatchObject({ code: 'STORAGE_DISABLED' });
    fixture.cors({ enabled: true });
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.endpoint.faults.beforeCopy = async () => {
      entered();
      await gate;
    };
    const completing = fixture.runtime.complete(old.id);
    try {
      await started;
      await expect(
        fixture.runtime.resubmit(old.id, 'active'),
      ).rejects.toMatchObject({ status: 409 });
      release();
      expect((await completing).state).toBe('accepted');
      await expect(
        fixture.runtime.resubmit(old.id, 'accepted'),
      ).rejects.toMatchObject({ status: 409 });
      expect(fixture.db.select().from(uploadSubmissions).all()).toHaveLength(1);
    } finally {
      release();
    }
  });

  it('fails and clears the registered direct object when storage is disabled before complete', async () => {
    const session = await direct();
    fixture.cors({ enabled: false });
    await expect(fixture.runtime.complete(session.id)).rejects.toMatchObject({
      code: 'STORAGE_DISABLED',
    });
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      temporaryKey: null,
      finalKey: null,
      temporaryPath: null,
      cleanupStatus: 'none',
    });
    expect(fixture.endpoint.objects.size).toBe(0);
    expect(readUploadReferences(fixture.db)).toEqual([]);
  });

  it('fails a begun relay session when storage is disabled before receive and releases its responsibility', async () => {
    fixture.cors({ corsStatus: 'failed' });
    const session = fixture.submission().sessions[0];
    expect(await fixture.runtime.begin(session.id, uploadOrigin)).toMatchObject(
      { route: 'relay' },
    );
    fixture.cors({ enabled: false });
    await expect(
      fixture.runtime.receive(session.id, uploadRequest(fixture.bytes)),
    ).rejects.toMatchObject({ code: 'STORAGE_DISABLED' });
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      temporaryKey: null,
      finalKey: null,
      temporaryPath: null,
      cleanupStatus: 'none',
    });
    expect(fixture.endpoint.objects.size).toBe(0);
    expect(readUploadReferences(fixture.db)).toEqual([]);
  });

  it('signs only when begun, registers one temporary key and never signs a final key', async () => {
    const queued = fixture.submission().sessions[0];
    expect(queued.temporaryKey).toBeNull();
    expect(fixture.endpoint.requests).toEqual([]);
    const before = Date.now();
    const result = await fixture.runtime.begin(queued.id, uploadOrigin);
    expect(result.route).toBe('direct');
    const signature = new URL(result.upload!.url);
    expect(signature.searchParams.get('X-Amz-Expires')).toBe('900');
    const session = getSession(fixture.db, queued.id);
    expect(session).toMatchObject({
      state: 'receiving',
      route: 'direct',
      cleanupStatus: 'pending',
      finalKey: null,
    });
    expect(session.temporaryKey).toMatch(
      new RegExp(`^uploads/${session.id}/[^/]+$`),
    );
    expect(decodeURIComponent(signature.pathname)).toBe(
      fixture.path(session.temporaryKey!),
    );
    expect(session.signatureExpiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 899000,
    );
    expect(fixture.endpoint.requests).toEqual([]);
    fixture.cors({ corsStatus: 'failed' });
    await expect(
      fixture.runtime.begin(queued.id, uploadOrigin),
    ).rejects.toMatchObject({ status: 409 });
    expect(getSession(fixture.db, queued.id).route).toBe('direct');
  });

  it.each([
    { name: 'untested CORS', config: { corsStatus: 'untested' as const } },
    { name: 'failed CORS', config: { corsStatus: 'failed' as const } },
    { name: 'stale revision', config: { corsRevision: 0 } },
    { name: 'different origin', config: { corsOrigin: 'http://old.test' } },
  ])(
    'uses explicit relay for $name and never sends a signature',
    async ({ config }) => {
      fixture.cors(config);
      const session = fixture.submission().sessions[0];
      const result = await fixture.runtime.begin(session.id, uploadOrigin);
      expect(result).toMatchObject({
        route: 'relay',
        reason: expect.any(String),
      });
      expect(result.upload).toBeUndefined();
      const accepted = await fixture.runtime.receive(
        session.id,
        uploadRequest(fixture.bytes),
      );
      expect(accepted).toMatchObject({ state: 'accepted', route: 'relay' });
      const original = fixture.db.select().from(mediaObjects).get()!;
      expect(
        fixture.endpoint.objects.get(fixture.path(original.key))!.bytes,
      ).toEqual(fixture.bytes);
      expect(
        await readFile(
          join(
            fixture.temporaryRoot,
            `media-input-${accepted.jobId}`,
            'original',
          ),
        ),
      ).toEqual(fixture.bytes);
      expect(
        fixture.endpoint.requests.some(
          ({ headers }) => headers['x-amz-copy-source'],
        ),
      ).toBe(false);
    },
  );

  it('returns local route for existing local target', async () => {
    const session = createSubmission(fixture.db, {
      requestId: 'local',
      storageId: fixture.storage.id,
      files: [
        {
          queueItemId: 'local',
          originalName: 'local.png',
          declaredSize: fixture.bytes.length,
        },
      ],
    }).sessions[0];
    expect(await fixture.runtime.begin(session.id, uploadOrigin)).toMatchObject(
      { route: 'local' },
    );
    expect(fixture.endpoint.requests).toEqual([]);
    const accepted = await fixture.runtime.receive(
      session.id,
      uploadRequest(fixture.bytes),
    );
    expect(accepted.state).toBe('accepted');
  });

  it('conditional GET/Copy admits actual format and creates one image, job and frozen relationships for concurrent complete', async () => {
    const album = fixture.db.transaction((tx) =>
      createAlbum(tx, { name: 'fixed album' }),
    );
    const [tag] = fixture.db.transaction((tx) =>
      getOrCreateTags(tx, ['fixed tag']),
    );
    const session = await direct(
      fixture.bytes,
      fixture.submission({
        albumIds: [album.id],
        tagIds: [tag.id],
        declaredMime: 'image/jpeg',
      }).sessions[0],
    );
    await expect(
      fixture.runtime.receive(session.id, uploadRequest(fixture.bytes)),
    ).rejects.toMatchObject({ status: 409 });
    const [first, second] = await Promise.all([
      fixture.runtime.complete(session.id),
      fixture.runtime.complete(session.id),
    ]);
    expect(first).toMatchObject({
      state: 'accepted',
      imageId: session.candidateImageId,
    });
    expect(second.imageId).toBe(first.imageId);
    await expect(
      stat(join(fixture.temporaryRoot, 'uploads', session.id)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await fixture.runtime.complete(session.id)).imageId).toBe(
      first.imageId,
    );
    expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
    expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
    expect(fixture.db.select().from(mediaVersions).all()).toHaveLength(1);
    expect(fixture.db.select().from(albumImages).all()).toMatchObject([
      { albumId: album.id, imageId: first.imageId },
    ]);
    expect(fixture.db.select().from(imageTags).all()).toMatchObject([
      { tagId: tag.id, imageId: first.imageId },
    ]);
    const original = fixture.db.select().from(mediaObjects).get()!;
    expect(original).toMatchObject({
      byteSize: fixture.bytes.length,
      mime: 'image/png',
      format: 'PNG',
    });
    expect(
      fixture.endpoint.objects.get(fixture.path(original.key))!.bytes,
    ).toEqual(fixture.bytes);
    expect(
      fixture.endpoint.objects.has(fixture.path(session.temporaryKey!)),
    ).toBe(false);
    const get = fixture.endpoint.requests.find(
      ({ method }) => method === 'GET',
    )!;
    const copies = fixture.endpoint.requests.filter(
      ({ headers }) => headers['x-amz-copy-source'],
    );
    expect(copies).toHaveLength(1);
    expect(get.headers['if-match']).toBeTruthy();
    expect(copies[0].headers['x-amz-copy-source-if-match']).toBe(
      get.headers['if-match'],
    );
    expect(
      await readFile(
        join(fixture.temporaryRoot, `media-input-${first.jobId}`, 'original'),
      ),
    ).toEqual(fixture.bytes);
  });

  it.each(['get', 'copy'] as const)(
    'rejects source changes before %s and never creates an image',
    async (stage) => {
      const session = await direct();
      const change = () => {
        const changed = Buffer.from(fixture.bytes);
        changed[changed.length - 1] ^= 1;
        fixture.endpoint.put(fixture.path(session.temporaryKey!), changed);
      };
      if (stage === 'get') fixture.endpoint.faults.beforeGet = change;
      else fixture.endpoint.faults.beforeCopy = change;
      await expect(fixture.runtime.complete(session.id)).rejects.toMatchObject({
        code: 'STORAGE_OBJECT_CHANGED',
      });
      assertNoAssets();
      expect(getSession(fixture.db, session.id)).toMatchObject({
        state: 'failed',
        temporaryKey: null,
        finalKey: null,
      });
      expect(fixture.endpoint.objects.size).toBe(0);
    },
  );

  it.each([
    { name: 'empty body', bytes: Buffer.alloc(0) },
    { name: 'declared size mismatch', bytes: Buffer.from('different size') },
    { name: 'unsupported bytes', bytes: Buffer.from('%PDF-1.7\nnot an image') },
  ])(
    'rejects $name before image creation and clears known keys',
    async ({ name, bytes }) => {
      const session = await direct(
        bytes,
        fixture.submission({
          bytes: name === 'unsupported bytes' ? bytes : fixture.bytes,
        }).sessions[0],
      );
      await expect(fixture.runtime.complete(session.id)).rejects.toBeDefined();
      assertNoAssets();
      expect(getSession(fixture.db, session.id)).toMatchObject({
        state: 'failed',
        temporaryKey: null,
        finalKey: null,
      });
      expect(fixture.endpoint.objects.size).toBe(0);
    },
  );

  it.each(['error', 'embedded-error'] as const)(
    'does not accept Copy %s, including HTTP 200 with Error XML',
    async (fault) => {
      const session = await direct();
      fixture.endpoint.faults.copy = fault;
      await expect(fixture.runtime.complete(session.id)).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
      });
      assertNoAssets();
      expect(getSession(fixture.db, session.id)).toMatchObject({
        state: 'failed',
        temporaryKey: null,
        finalKey: null,
      });
      expect(fixture.endpoint.objects.size).toBe(0);
    },
  );

  it('cleans the registered candidate when Copy committed but its response was lost', async () => {
    const session = await direct();
    fixture.endpoint.faults.copy = 'lost-response';
    await expect(fixture.runtime.complete(session.id)).rejects.toBeDefined();
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      temporaryKey: null,
      finalKey: null,
    });
    expect(fixture.endpoint.objects.size).toBe(0);
  });

  it('rolls back a failed acceptance transaction and clears S3 candidates and retained input', async () => {
    const session = await direct();
    fixture.db.run(
      sql.raw(
        "CREATE TRIGGER reject_s3_accept BEFORE UPDATE OF state ON upload_sessions WHEN NEW.state = 'accepted' BEGIN SELECT RAISE(ABORT, 'injected S3 acceptance failure'); END",
      ),
    );
    await expect(fixture.runtime.complete(session.id)).rejects.toThrow(
      'injected S3 acceptance failure',
    );
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      imageId: null,
      jobId: null,
      temporaryKey: null,
      finalKey: null,
    });
    expect(
      await readMediaInput(fixture.temporaryRoot, session.candidateJobId!),
    ).toBeNull();
    expect(fixture.endpoint.objects.size).toBe(0);
  });

  it('settles in-flight Copy before cancellation cleanup and rejects late complete', async () => {
    const session = await direct();
    let entered!: () => void;
    let release!: () => void;
    const enteredCopy = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.endpoint.faults.beforeCopy = async () => {
      entered();
      await gate;
    };
    const completing = fixture.runtime.complete(session.id);
    const rejected = expect(completing).rejects.toBeDefined();
    try {
      await enteredCopy;
      const cancellation = fixture.runtime.cancel(session.id);
      expect(getSession(fixture.db, session.id).state).toBe('cancelled');
      release();
      expect(await cancellation).toMatchObject({
        state: 'cancelled',
        imageId: null,
        jobId: null,
      });
      await rejected;
      await expect(fixture.runtime.complete(session.id)).rejects.toMatchObject({
        status: 409,
      });
      assertNoAssets();
      expect(fixture.endpoint.objects.size).toBe(0);
    } finally {
      release();
    }
  });

  it('idle direct sessions expire, clean exact keys and cannot accept late PUT/complete', async () => {
    const session = await direct();
    fixture.db
      .update(uploadSubmissions)
      .set({ lastActivityAt: new Date(Date.now() - 3600001) })
      .where(eq(uploadSubmissions.id, session.submissionId))
      .run();
    expireUploadSessions(fixture.db);
    expect(getSession(fixture.db, session.id).state).toBe('expired');
    await cleanupSession(fixture.context, session.id);
    await expect(fixture.runtime.complete(session.id)).rejects.toMatchObject({
      status: 409,
    });
    assertNoAssets();
    expect(fixture.endpoint.objects.size).toBe(0);
    fixture.endpoint.put(fixture.path(session.temporaryKey!), fixture.bytes);
    await expect(fixture.runtime.complete(session.id)).rejects.toMatchObject({
      status: 409,
    });
    assertNoAssets();
    // Late PUT is now an orphan in the namespace owned by the T-STO-06 scanner.
    expect(
      fixture.endpoint.objects.has(fixture.path(session.temporaryKey!)),
    ).toBe(true);
  });

  it.each(['receiving', 'validating', 'finalizing'] as const)(
    'restart retains and cleans interrupted %s responsibility without new assets',
    async (state) => {
      const session = await direct();
      const finalKey =
        state === 'finalizing'
          ? `original/${session.candidateImageId}.png`
          : null;
      fixture.db
        .update(uploadSessions)
        .set({ state, finalKey })
        .where(eq(uploadSessions.id, session.id))
        .run();
      if (finalKey) fixture.endpoint.put(fixture.path(finalKey), fixture.bytes);
      const neighbour = fixture.path('uploads/neighbour/original');
      fixture.endpoint.put(neighbour, fixture.bytes);
      recoverUploadSessions(fixture.db);
      expect(getSession(fixture.db, session.id)).toMatchObject({
        state: 'failed',
        errorCode: 'UPLOAD_INTERRUPTED',
      });
      await cleanupSession(fixture.context, session.id);
      expect(getSession(fixture.db, session.id)).toMatchObject({
        temporaryKey: null,
        finalKey: null,
        cleanupStatus: 'none',
      });
      assertNoAssets();
      expect([...fixture.endpoint.objects.keys()]).toEqual([neighbour]);
    },
  );

  it('retains known delete failures and durable retry budget across restart, then explicitly cleans', async () => {
    const session = await direct();
    fixture.endpoint.faults.delete = true;
    await expect(fixture.runtime.cancel(session.id)).rejects.toBeDefined();
    for (let i = 0; i < 2; i++)
      await expect(
        cleanupSession(fixture.context, session.id),
      ).rejects.toBeDefined();
    recoverUploadSessions(fixture.db);
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'cancelled',
      cleanupStatus: 'failed',
      cleanupAttempts: 3,
      temporaryKey: session.temporaryKey,
    });
    assertNoAssets();
    fixture.endpoint.faults.delete = false;
    expect(await fixture.runtime.retryCleanup(session.id)).toMatchObject({
      cleanupStatus: 'none',
      cleanupAttempts: 0,
      temporaryKey: null,
    });
    expect(fixture.endpoint.objects.size).toBe(0);
  });

  it('reports known bytes for both owned keys, unknown objects without declared-byte guesses, and excludes tmp paths', async () => {
    const first = fixture.submission().sessions[0];
    const second = fixture.submission().sessions[0];
    expect(readUploadUsage(fixture.db)).toEqual([]);
    await fixture.runtime.begin(first.id, uploadOrigin);
    expect(readUploadUsage(fixture.db)).toEqual([
      {
        storageId: fixture.storageId,
        knownBytes: 0,
        unconfirmedObjects: 1,
        confirmedAt: null,
      },
    ]);
    const confirmedAt = new Date();
    fixture.db
      .update(uploadSessions)
      .set({
        state: 'finalizing',
        finalKey: `original/${first.candidateImageId}.png`,
        temporaryBytes: 17,
        finalBytes: 17,
        confirmedAt,
      })
      .where(eq(uploadSessions.id, first.id))
      .run();
    fixture.db
      .update(uploadSessions)
      .set({
        route: 'relay',
        state: 'receiving',
        temporaryPath: '/controlled/tmp/relay',
      })
      .where(eq(uploadSessions.id, second.id))
      .run();
    const before = fixture.db.select().from(uploadSessions).all();
    expect(readUploadUsage(fixture.db)).toEqual([
      {
        storageId: fixture.storageId,
        knownBytes: 34,
        unconfirmedObjects: 0,
        confirmedAt,
      },
    ]);
    expect(readUploadReferences(fixture.db)).toEqual([
      {
        sessionId: first.id,
        storageId: fixture.storageId,
        state: 'finalizing',
        temporaryKey: getSession(fixture.db, first.id).temporaryKey,
        finalKey: `original/${first.candidateImageId}.png`,
        temporaryPath: null,
        cleanupStatus: 'pending',
      },
      {
        sessionId: second.id,
        storageId: fixture.storageId,
        state: 'receiving',
        temporaryKey: null,
        finalKey: null,
        temporaryPath: '/controlled/tmp/relay',
        cleanupStatus: 'none',
      },
    ]);
    expect(fixture.db.select().from(uploadSessions).all()).toEqual(before);
  });

  it('transfers the formal key to media while retaining failed temporary cleanup as known upload usage', async () => {
    const session = await direct();
    fixture.endpoint.faults.delete = true;
    await expect(fixture.runtime.complete(session.id)).resolves.toMatchObject({
      state: 'accepted',
      cleanupStatus: 'pending',
    });
    const accepted = getSession(fixture.db, session.id);
    expect(accepted).toMatchObject({
      state: 'accepted',
      imageId: session.candidateImageId,
      temporaryKey: session.temporaryKey,
      finalKey: null,
    });
    expect(accepted.error).toContain('Injected upload fixture failure');
    expect(readUploadReferences(fixture.db)).toEqual([
      {
        storageId: fixture.storageId,
        sessionId: session.id,
        state: 'accepted',
        temporaryKey: session.temporaryKey,
        finalKey: null,
        temporaryPath: accepted.temporaryPath,
        cleanupStatus: 'pending',
      },
    ]);
    expect(readUploadUsage(fixture.db)).toEqual([
      {
        storageId: fixture.storageId,
        knownBytes: fixture.bytes.length,
        unconfirmedObjects: 0,
        confirmedAt: expect.any(Date),
      },
    ]);
    const original = fixture.db.select().from(mediaObjects).get()!;
    fixture.endpoint.faults.delete = false;
    expect(await fixture.runtime.retryCleanup(session.id)).toMatchObject({
      state: 'accepted',
      temporaryKey: null,
      cleanupStatus: 'none',
    });
    expect(readUploadUsage(fixture.db)).toEqual([]);
    expect(readUploadReferences(fixture.db)).toEqual([]);
    expect(
      fixture.endpoint.objects.get(fixture.path(original.key))!.bytes,
    ).toEqual(fixture.bytes);
  });
  it('retains queued and begun relay storage references before any object key exists', async () => {
    const session = fixture.submission().sessions[0];
    expect(readUploadReferences(fixture.db)).toEqual([
      {
        storageId: fixture.storageId,
        sessionId: session.id,
        state: 'queued',
        temporaryKey: null,
        finalKey: null,
        temporaryPath: null,
        cleanupStatus: 'none',
      },
    ]);
    fixture.cors({ corsStatus: 'failed' });
    await fixture.runtime.begin(session.id, uploadOrigin);
    expect(readUploadReferences(fixture.db)).toEqual([
      {
        storageId: fixture.storageId,
        sessionId: session.id,
        state: 'receiving',
        temporaryKey: null,
        finalKey: null,
        temporaryPath: null,
        cleanupStatus: 'none',
      },
    ]);
    expect(readUploadUsage(fixture.db)).toEqual([]);
    await fixture.runtime.cancel(session.id);
    expect(readUploadReferences(fixture.db)).toEqual([]);
  });
});
