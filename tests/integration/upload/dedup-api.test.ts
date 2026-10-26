import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';
import { createPublicReceipt } from '../../../src/server/upload/public-receive.ts';
import { mediaImages, mediaJobs } from '../../../src/server/media/schema.ts';
import { publicUploadResponse } from '../../../src/server/upload/public-http.ts';
import { publicUploadErrorSchema } from '../../../src/server/upload/public-contract.ts';

const server = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => server.current,
}));
vi.mock('../../../src/server/identity/tokens.ts', () => ({
  verifyUploadToken: async () => ({ tokenId: 'upload-only' }),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error() {} }),
}));
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
let fixture: ReturnType<typeof collectionFixture>;
let runtime: ReturnType<typeof startUploadRuntime>;
let bytes: Buffer;
beforeEach(async () => {
  fixture = collectionFixture();
  bytes = await readFile('tests/fixtures/media-formats/source.png');
  runtime = startUploadRuntime({
    ...fixture,
    temporaryRoot: join(dirname(fixture.storageRoot), 'tmp'),
    logger: { info() {}, error() {} },
  });
  server.current = {
    connection: { db: fixture.db },
    config: { dataDir: dirname(fixture.storageRoot) },
    uploads: runtime,
    contentMutations: {
      run: (_name: string, operation: () => Promise<unknown>) => operation(),
    },
  };
});
afterEach(async () => {
  await runtime?.stop();
  fixture?.close();
});
function request() {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'renamed.png');
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: form,
  });
}
function prepare() {
  return createSubmission(fixture.db, {
    requestId: randomUUID(),
    visibility: 'private',
    files: [
      {
        queueItemId: 'file',
        originalName: 'private-original.png',
        declaredSize: bytes.length,
      },
    ],
  }).sessions[0];
}

it('returns explicit 409 without leaking the existing private image identity, name or URLs', async () => {
  const accepted = await runtime.receive(prepare().id, request());
  const response = await publicUploadResponse(request());
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body).toEqual({
    imageId: null,
    status: 'not_created',
    error: {
      code: 'UPLOAD_DUPLICATE',
      stage: 'deduplication',
      message: '相同图片已存在，本次未新增。请登录图库核对。',
    },
    requestId: expect.any(String),
  });
  expect(publicUploadErrorSchema.safeParse(body).success).toBe(true);
  expect(JSON.stringify(body)).not.toContain(accepted.imageId!);
  expect(JSON.stringify(body)).not.toContain('private-original');
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
});

it('arbitrates Web and API reception through the same final acceptance transaction', async () => {
  const web = prepare();
  const receipt = createPublicReceipt({
    ...fixture,
    temporaryRoot: join(dirname(fixture.storageRoot), 'tmp'),
  });
  const results = await Promise.all([
    runtime.receive(web.id, request()),
    runtime.receivePublic(receipt, request(), 'upload-only'),
  ]);
  expect(results.map((result) => result.state).sort()).toEqual([
    'accepted',
    'duplicate',
  ]);
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
});
