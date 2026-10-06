import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import * as publicReceive from '../../../src/server/upload/public-receive.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';
import {
  createSubmission,
  getPreparedSession,
} from '../../../src/server/upload/sessions.ts';
import {
  uploadSessions,
  type PreparedUploadSession,
} from '../../../src/server/upload/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
let runtime: ReturnType<typeof startUploadRuntime>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(async () => {
  await runtime?.stop();
  vi.restoreAllMocks();
  fixture.close();
});

function context() {
  return {
    ...fixture,
    temporaryRoot: join(fixture.storageRoot, 'tmp'),
    logger: { info() {}, error() {} },
  };
}
function prepare(id: string) {
  const submission = createSubmission(fixture.db, {
    requestId: id,
    files: [{ queueItemId: 'web', originalName: 'web.png', declaredSize: 10 }],
  });
  fixture.db
    .update(uploadSessions)
    .set({ submissionId: submission.id, storageId: fixture.storage.id })
    .where(eq(uploadSessions.id, id))
    .run();
}

it('counts a public receiver as a storage writer immediately after target preparation and prevents duplicate writers', async () => {
  const operation = Promise.withResolvers<PreparedUploadSession>();
  const receiver = vi
    .spyOn(publicReceive, 'receivePublicSession')
    .mockImplementation(() => operation.promise);
  const uploadContext = context();
  runtime = startUploadRuntime(uploadContext);
  const id = publicReceive.createPublicReceipt(uploadContext);
  const request = new Request('http://localhost/api/v1/uploads', {
    method: 'POST',
  });
  const result = runtime.receivePublic(id, request, 'non-secret-token-id');
  expect(runtime.activeWrites(fixture.storage.id)).toBe(0);
  expect(receiver).toHaveBeenCalledWith(
    uploadContext,
    id,
    request,
    expect.any(AbortSignal),
    'non-secret-token-id',
  );
  expect(() =>
    runtime.receivePublic(id, request, 'non-secret-token-id'),
  ).toThrow(
    expect.objectContaining({ code: 'UPLOAD_STATE_CONFLICT', status: 409 }),
  );
  expect(() => runtime.receive(id, request)).toThrow(
    expect.objectContaining({ code: 'UPLOAD_STATE_CONFLICT', status: 409 }),
  );
  prepare(id);
  expect(runtime.activeWrites(fixture.storage.id)).toBe(1);
  fixture.db
    .update(uploadSessions)
    .set({ state: 'accepted', temporaryPath: null, cleanupStatus: 'none' })
    .where(eq(uploadSessions.id, id))
    .run();
  operation.resolve(getPreparedSession(fixture.db, id));
  await expect(result).resolves.toMatchObject({
    state: 'accepted',
    storageId: fixture.storage.id,
  });
  expect(runtime.activeWrites(fixture.storage.id)).toBe(0);
});

it('stops public reception through the shared controller and settles its active promise before returning', async () => {
  let receivingSignal: AbortSignal | undefined;
  vi.spyOn(publicReceive, 'receivePublicSession').mockImplementation(
    (_context, _id, _request, signal) => {
      receivingSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      });
    },
  );
  const uploadContext = context();
  runtime = startUploadRuntime(uploadContext);
  const id = publicReceive.createPublicReceipt(uploadContext);
  const result = runtime.receivePublic(
    id,
    new Request('http://localhost/api/v1/uploads', { method: 'POST' }),
    'non-secret-token-id',
  );
  const rejected = expect(result).rejects.toMatchObject({
    code: 'UPLOAD_INTERRUPTED',
    status: 503,
  });
  prepare(id);
  expect(runtime.activeWrites(fixture.storage.id)).toBe(1);
  await runtime.stop();
  await rejected;
  expect(receivingSignal?.aborted).toBe(true);
  expect(runtime.activeWrites(fixture.storage.id)).toBe(0);
  expect(() =>
    runtime.receivePublic(
      id,
      new Request('http://localhost'),
      'non-secret-token-id',
    ),
  ).toThrow(expect.objectContaining({ code: 'UPLOAD_STOPPING', status: 503 }));
});
