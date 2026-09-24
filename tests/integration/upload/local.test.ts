import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crc32 } from 'node:zlib';
import * as formats from '../../../src/server/media/formats.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { processMediaJob } from '../../../src/server/media/process.ts';
import { collectionFixture } from '../collections/helpers.ts';
import {
  createAlbum,
  deleteAlbum,
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
import { storageSettings } from '../../../src/server/storage/schema.ts';
import {
  uploadSessions,
  uploadSettings,
} from '../../../src/server/upload/schema.ts';
import {
  createSubmission,
  getSession,
} from '../../../src/server/upload/sessions.ts';
import { receiveSession } from '../../../src/server/upload/receive.ts';
import {
  cleanupSession,
  recoverUploadSessions,
} from '../../../src/server/upload/cleanup.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';

let fixture: ReturnType<typeof collectionFixture>;
let bytes: Buffer;
beforeEach(async () => {
  fixture = collectionFixture();
  bytes = await readFile('tests/fixtures/runtime/images/sample.png');
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});
function submission(requestId = 'r', albumIds: string[] = []) {
  return createSubmission(fixture.db, {
    requestId,
    albumIds,
    files: [
      {
        queueItemId: 'q',
        originalName: 'same.jpg',
        declaredSize: bytes.length,
        declaredMime: 'image/jpeg',
      },
    ],
  });
}
function request() {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'untrusted.jpg');
  return new Request('http://localhost/api/uploads/content', {
    method: 'POST',
    body: form,
  });
}
function receive(id: string) {
  return receiveSession(fixture, id, request(), new AbortController().signal);
}
function filePath(key: string) {
  return join(
    fixture.storageRoot,
    fixture.storage.localPath,
    'ariso',
    fixture.storage.id,
    key,
  );
}
function assertNoAssets() {
  for (const table of [
    mediaImages,
    mediaJobs,
    mediaObjects,
    mediaVersions,
    albumImages,
    imageTags,
  ])
    expect(fixture.db.select().from(table).all()).toEqual([]);
}

describe('real local upload reception and ownership', () => {
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
    return fixture.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, job.id))
      .get()!;
  }

  it('keeps accepted work after the request disconnects during actual inspection and processes it to ready', async () => {
    const session = submission().sessions[0];
    const disconnect = new AbortController();
    const originalInspect = formats.inspectImage;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(formats, 'inspectImage').mockImplementationOnce(
      async (...args) => {
        entered();
        await gate;
        return originalInspect(...args);
      },
    );
    const pending = receiveSession(
      fixture,
      session.id,
      new Request(request(), { signal: disconnect.signal }),
      new AbortController().signal,
    );
    await started;
    expect(getSession(fixture.db, session.id).state).toBe('validating');
    disconnect.abort(new Error('client disconnected after body'));
    release();
    const accepted = await pending;
    expect(accepted.state).toBe('accepted');
    expect((await processNext()).status).toBe('succeeded');
    expect(fixture.db.select().from(mediaImages).get()!.processingStatus).toBe(
      'ready',
    );
  });

  it('retains a recognized PNG original when decoding its damaged IDAT fails after acceptance', async () => {
    bytes = Buffer.from(bytes);
    let offset = 8;
    let damaged = false;
    while (offset < bytes.length) {
      const size = bytes.readUInt32BE(offset);
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
        bytes.fill(0, offset + 8, offset + 8 + size);
        bytes.writeUInt32BE(
          crc32(bytes.subarray(offset + 4, offset + 8 + size)),
          offset + 8 + size,
        );
        damaged = true;
        break;
      }
      offset += 12 + size;
    }
    expect(damaged).toBe(true);
    const accepted = await receive(submission().sessions[0].id);
    expect(accepted.state).toBe('accepted');
    const result = await processNext();
    expect(result.status).toBe('failed');
    expect(fixture.db.select().from(mediaImages).get()!.processingStatus).toBe(
      'failed',
    );
    expect(getSession(fixture.db, accepted.id).state).toBe('accepted');
    const original = fixture.db
      .select()
      .from(mediaVersions)
      .where(eq(mediaVersions.kind, 'original'))
      .get()!;
    const object = fixture.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, original.objectId))
      .get()!;
    expect(await readFile(filePath(object.key))).toEqual(bytes);
  });

  it('rejects non-image content during initial identification and cleans it without creating an asset', async () => {
    bytes = Buffer.from('this is not an image');
    const session = submission().sessions[0];
    await expect(receive(session.id)).rejects.toBeDefined();
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      imageId: null,
      jobId: null,
      temporaryKey: null,
      finalKey: null,
      cleanupStatus: 'none',
    });
  });

  it('stores exact original bytes with detected PNG metadata, distinct duplicate IDs and frozen settings', async () => {
    const first = submission();
    fixture.db
      .update(mediaSettings)
      .set({ quality: 31, defaultVisibility: 'private' })
      .run();
    fixture.db.update(uploadSettings).set({ maxFileBytes: 1 }).run();
    fixture.db.update(storageSettings).set({ defaultStorageId: null }).run();
    const accepted = await receive(first.sessions[0].id);
    expect(accepted.state).toBe('accepted');
    const image = fixture.db.select().from(mediaImages).get()!;
    expect(image).toMatchObject({
      visibility: 'public',
      mime: 'image/png',
      format: 'PNG',
    });
    expect(fixture.db.select().from(mediaJobs).get()!.snapshot.quality).toBe(
      82,
    );
    const key = fixture.db.select().from(mediaObjects).get()!.key;
    expect(await readFile(filePath(key))).toEqual(bytes);
    fixture.db.update(uploadSettings).set({ maxFileBytes: 52428800 }).run();
    fixture.db
      .update(storageSettings)
      .set({ defaultStorageId: fixture.storage.id })
      .run();
    const second = await receive(submission('second').sessions[0].id);
    expect(second.imageId).not.toBe(accepted.imageId);
    expect(fixture.db.select().from(mediaImages).all()).toHaveLength(2);
  });

  it('rolls back asset, object, job and relationship rows when the selected album was deleted', async () => {
    const album = fixture.db.transaction((tx) =>
      createAlbum(tx, { name: 'selected' }),
    );
    const session = submission('r', [album.id]).sessions[0];
    fixture.db.transaction((tx) => deleteAlbum(tx, album.id));
    await expect(receive(session.id)).rejects.toMatchObject({
      code: 'COLLECTION_TARGET_REMOVED',
    });
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      temporaryKey: null,
      finalKey: null,
      cleanupStatus: 'none',
    });
    await expect(
      stat(filePath(`original/${session.candidateImageId}.png`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back every ownership row after a SQLite acceptance failure and deletes the published candidate', async () => {
    const album = fixture.db.transaction((tx) =>
      createAlbum(tx, { name: 'selected' }),
    );
    const session = submission('r', [album.id]).sessions[0];
    fixture.db.run(
      sql.raw(
        "CREATE TRIGGER reject_upload_accept BEFORE UPDATE OF state ON upload_sessions WHEN NEW.state = 'accepted' BEGIN SELECT RAISE(ABORT, 'injected acceptance failure'); END",
      ),
    );
    await expect(receive(session.id)).rejects.toThrow(
      'injected acceptance failure',
    );
    assertNoAssets();
    expect(getSession(fixture.db, session.id)).toMatchObject({
      state: 'failed',
      temporaryKey: null,
      finalKey: null,
    });
  });

  it('settles an active writer before cancellation cleanup and rejects cancellation after acceptance', async () => {
    const runtime = startUploadRuntime({
      ...fixture,
      logger: { info() {}, error() {} },
    });
    try {
      const session = submission().sessions[0];
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });
      controller.enqueue(
        new TextEncoder().encode(
          '--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n',
        ),
      );
      const pending = runtime.receive(
        session.id,
        new Request('http://localhost/content', {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
          body,
          duplex: 'half',
        } as RequestInit),
      );
      const failed = expect(pending).rejects.toBeDefined();
      expect(await runtime.cancel(session.id)).toMatchObject({
        state: 'cancelled',
        cleanupStatus: 'none',
        temporaryKey: null,
      });
      await failed;
      assertNoAssets();
      const accepted = await runtime.receive(
        submission('next').sessions[0].id,
        request(),
      );
      await expect(runtime.cancel(accepted.id)).rejects.toMatchObject({
        status: 409,
        imageId: accepted.imageId,
      });
    } finally {
      await runtime.stop();
    }
  });

  it.each(['receiving', 'finalizing'] as const)(
    'recovers interrupted %s keys without touching adjacent files',
    async (state) => {
      const session = submission().sessions[0];
      const temporaryKey = `uploads/${session.id}.partial`;
      const finalKey =
        state === 'finalizing'
          ? `original/${session.candidateImageId}.png`
          : null;
      await mkdir(filePath('uploads'), { recursive: true });
      await mkdir(filePath('original'), { recursive: true });
      await writeFile(filePath(temporaryKey), bytes);
      if (finalKey) await writeFile(filePath(finalKey), bytes);
      await writeFile(filePath('uploads/neighbour.partial'), 'keep');
      fixture.db
        .update(uploadSessions)
        .set({ state, temporaryKey, finalKey })
        .where(eq(uploadSessions.id, session.id))
        .run();
      recoverUploadSessions(fixture.db);
      await cleanupSession(fixture, session.id);
      expect(getSession(fixture.db, session.id)).toMatchObject({
        state: 'failed',
        errorCode: 'UPLOAD_INTERRUPTED',
        temporaryKey: null,
        finalKey: null,
      });
      expect(
        await readFile(filePath('uploads/neighbour.partial'), 'utf8'),
      ).toBe('keep');
      await expect(stat(filePath(temporaryKey))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      if (finalKey)
        await expect(stat(filePath(finalKey))).rejects.toMatchObject({
          code: 'ENOENT',
        });
    },
  );

  it('retains cleanup failures and exhausts its durable retry budget until explicitly retried', async () => {
    const session = submission().sessions[0];
    const temporaryKey = `uploads/${session.id}.partial`;
    await mkdir(filePath(temporaryKey), { recursive: true });
    fixture.db
      .update(uploadSessions)
      .set({ state: 'failed', temporaryKey, cleanupStatus: 'pending' })
      .where(eq(uploadSessions.id, session.id))
      .run();
    for (let i = 0; i < 3; i++)
      await expect(cleanupSession(fixture, session.id)).rejects.toBeDefined();
    recoverUploadSessions(fixture.db);
    expect(getSession(fixture.db, session.id)).toMatchObject({
      cleanupStatus: 'failed',
      cleanupAttempts: 3,
      temporaryKey,
    });
    await rm(filePath(temporaryKey), { recursive: true });
    const runtime = startUploadRuntime({
      ...fixture,
      logger: { info() {}, error() {} },
    });
    try {
      expect(await runtime.retryCleanup(session.id)).toMatchObject({
        cleanupStatus: 'none',
        cleanupAttempts: 0,
        temporaryKey: null,
      });
    } finally {
      await runtime.stop();
    }
  });
});
