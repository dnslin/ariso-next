import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRestoreReceiver,
  RESTORE_CHUNK_BYTES,
} from '../../../src/server/backup/restore-upload.ts';
import {
  readJobState,
  writeJobState,
} from '../../../src/server/backup/jobs.ts';
import type { RestoreJob } from '../../../src/server/backup/types.ts';

let directory: string;
let state: RestoreJob;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-restore-upload-'));
  state = {
    kind: 'restore',
    id: randomUUID(),
    createdAt: 1,
    updatedAt: 1,
    status: 'receiving',
    uploadBytes: RESTORE_CHUNK_BYTES + 3,
    receivedBytes: 0,
  };
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function receiver() {
  return createRestoreReceiver({
    directory,
    getState: () => state,
    saveState: (next) => {
      writeJobState(directory, next);
      state = next;
    },
  });
}
function request(body: Uint8Array | ReadableStream<Uint8Array>) {
  return new Request('http://localhost/api/setup/restore/id/file', {
    method: 'PUT',
    body,
    duplex: 'half',
  } as RequestInit);
}

describe('restore encrypted-file sequential chunks', () => {
  it('publishes only a fully received and synchronized file', async () => {
    const upload = receiver();
    const first = Buffer.alloc(RESTORE_CHUNK_BYTES, 7);
    await upload.receive(request(first), 0, state.uploadBytes);
    expect(state.status).toBe('receiving');
    expect(state.receivedBytes).toBe(first.length);
    await expect(stat(join(directory, 'source.zip.age'))).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    await upload.receive(
      request(Buffer.from([1, 2, 3])),
      first.length,
      state.uploadBytes,
    );
    expect(state.status).toBe('received');
    expect(
      (await readFile(join(directory, 'source.zip.age'))).equals(
        Buffer.concat([first, Buffer.from([1, 2, 3])]),
      ),
    ).toBe(true);
    expect(readJobState(directory)).toEqual(state);
    await expect(
      upload.receive(request(first), 0, state.uploadBytes),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects mismatched offsets and total lengths before consuming a body', async () => {
    const upload = receiver();
    let consumed = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          consumed = true;
        },
      },
      { highWaterMark: 0 },
    );
    await expect(
      upload.receive(request(body), 1, state.uploadBytes),
    ).rejects.toMatchObject({ code: 'BACKUP_UPLOAD_OFFSET' });
    expect(consumed).toBe(false);
    await expect(
      upload.receive(request(Buffer.alloc(1)), 0, state.uploadBytes + 1),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.receivedBytes).toBe(0);
  });

  it('rolls back short or oversized blocks to the last acknowledged prefix', async () => {
    const upload = receiver();
    await expect(
      upload.receive(request(Buffer.alloc(10)), 0, state.uploadBytes),
    ).rejects.toMatchObject({ code: 'BACKUP_UPLOAD_INCOMPLETE' });
    expect((await stat(join(directory, 'source.zip.age.part'))).size).toBe(0);
    await upload.receive(
      request(Buffer.alloc(RESTORE_CHUNK_BYTES, 4)),
      0,
      state.uploadBytes,
    );
    await expect(
      upload.receive(
        request(Buffer.alloc(4)),
        RESTORE_CHUNK_BYTES,
        state.uploadBytes,
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_UPLOAD_SIZE' });
    expect(state.receivedBytes).toBe(RESTORE_CHUNK_BYTES);
    expect((await stat(join(directory, 'source.zip.age.part'))).size).toBe(
      RESTORE_CHUNK_BYTES,
    );
  });

  it('waits for the old writer before resetting and permits a fresh upload', async () => {
    const upload = receiver();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.alloc(4096, 9));
      },
      cancel() {
        cancelled = true;
      },
    });
    const pending = upload.receive(request(body), 0, state.uploadBytes);
    const outcome = pending.then(
      () => null,
      (error: unknown) => error,
    );
    const limit = Date.now() + 3000;
    while (
      (
        await stat(join(directory, 'source.zip.age.part')).catch(() => ({
          size: 0,
        }))
      ).size === 0
    ) {
      if (Date.now() > limit) throw new Error('fixture writer did not start');
      await delay(5);
    }
    await expect(
      upload.receive(request(Buffer.alloc(10)), 0, state.uploadBytes),
    ).rejects.toMatchObject({ status: 409 });
    await upload.reset();
    expect(await outcome).toBeInstanceOf(Error);
    expect(cancelled).toBe(true);
    expect(state.receivedBytes).toBe(0);
    expect((await stat(join(directory, 'source.zip.age.part'))).size).toBe(0);
    await upload.receive(
      request(Buffer.alloc(RESTORE_CHUNK_BYTES, 2)),
      0,
      state.uploadBytes,
    );
    expect((await readFile(join(directory, 'source.zip.age.part')))[0]).toBe(2);
  });

  it('does not finish stopping while a reset can still write task state', async () => {
    const upload = receiver();
    let resetFinished = false;
    const reset = upload.reset().finally(() => {
      resetFinished = true;
    });
    await upload.stop();
    const finishedAtStop = resetFinished;
    await reset;
    expect(finishedAtStop).toBe(true);
    expect(upload.receiving).toBe(false);
    await expect(
      upload.receive(
        request(Buffer.alloc(RESTORE_CHUNK_BYTES)),
        0,
        state.uploadBytes,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
