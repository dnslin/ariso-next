import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { resolveUploadStorage } from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>>;
let connection: ReturnType<typeof openRuntimeDatabase>;
let env: Record<string, string>;
let origin: string;
let cookie: string;
let token: string;
let imageId: string;
let originalPath: string;
let bytes: Buffer;

async function ready() {
  await vi.waitFor(
    async () => {
      if (server.child.exitCode !== null) throw new Error(server.logs());
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/health`,
        { signal: AbortSignal.timeout(1000) },
      );
      expect(response.status).toBe(200);
    },
    { timeout: 15000 },
  );
}

async function mutate(
  operation: 'trash' | 'restore',
  id = imageId,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${origin}/api/images/${id}/${operation}`, {
    method: 'POST',
    headers: { origin, cookie, ...headers },
    signal: AbortSignal.timeout(10000),
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  return { status: response.status, body: await response.json() };
}

function snapshot() {
  return {
    image: connection.db.select().from(mediaImages).get()!,
    objects: connection.db.select().from(mediaObjects).all(),
    versions: connection.db.select().from(mediaVersions).all(),
    jobs: connection.db.select().from(mediaJobs).all(),
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-trash-http-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  server = await launch(resolve('.next/standalone'), directory, env);
  await ready();
  origin = `http://127.0.0.1:${server.port}`;
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
  await seedAuthOwner(connection, origin);
  const login = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000),
  });
  expect(login.status, await login.clone().text()).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  token = (await login.json()).token;
  const storage = resolveUploadStorage(connection.db);
  const plan = planLocalWrite('uploads');
  const storageRoot = join(env.DATA_DIR, 'storage');
  bytes = await readFile(resolve('tests/fixtures/runtime/images/sample.png'));
  await writeObject(storageRoot, storage, plan, Readable.from(bytes));
  originalPath = join(
    storageRoot,
    storage.localPath,
    'ariso',
    storage.id,
    plan.key,
  );
  expect(await readFile(originalPath)).toEqual(bytes);
  imageId = randomUUID();
  connection.db.transaction((tx) => {
    const accepted = acceptOriginal(tx, {
      imageId,
      storageId: storage.id,
      key: plan.key,
      originalName: 'HTTP-original.png',
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    });
    // Persist a terminal failed asset fixture before the live queue can claim it.
    // This tests metadata HTTP and does not claim that processing was performed.
    tx.update(mediaJobs)
      .set({ status: 'failed', error: 'fixture: prior processing failed' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    tx.update(mediaImages)
      .set({ processingStatus: 'failed' })
      .where(eq(mediaImages.id, imageId))
      .run();
  });
}, 30000);

afterEach(async () => {
  if (server) await stop(server.child, server.closed);
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('requires a real owner Cookie and saved origin for both metadata endpoints', async () => {
  const before = snapshot();
  for (const operation of ['trash', 'restore'] as const) {
    const anonymousHeaders: Record<string, string>[] = [
      { cookie: '' },
      { cookie: '', authorization: `Bearer ${token}` },
      { cookie: `ariso.share_token=${encodeURIComponent(token)}` },
    ];
    for (const headers of anonymousHeaders) {
      const result = await mutate(operation, imageId, headers);
      expect(result.status).toBe(401);
      expect(result.body).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    for (const requestOrigin of ['', 'https://foreign.example']) {
      const result = await mutate(operation, imageId, {
        origin: requestOrigin,
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ code: 'INVALID_ORIGIN' });
    }
    const missing = await mutate(operation, 'missing');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: 'MEDIA_IMAGE_NOT_FOUND' });
  }
  expect(snapshot()).toEqual(before);
});

it('keeps old trash timestamps and original bytes across a real restart and restores disabled storage records', async () => {
  const before = snapshot();
  const trashed = await mutate('trash');
  expect(trashed.status).toBe(200);
  expect(trashed.body).toEqual({
    imageId,
    trashedAt: expect.any(String),
  });
  expect(await mutate('trash')).toEqual(trashed);
  const oldTrash = new Date('2000-01-01T00:00:00.000Z');
  connection.db
    .update(mediaImages)
    .set({ trashedAt: oldTrash })
    .where(eq(mediaImages.id, imageId))
    .run();
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  const oldPid = server.child.pid;
  env.PORT = String(server.port);
  await stop(server.child, server.closed);
  server = await launch(resolve('.next/standalone'), directory, env);
  await ready();
  expect(server.child.pid).not.toBe(oldPid);
  expect(await mutate('trash')).toEqual({
    status: 200,
    body: { imageId, trashedAt: oldTrash.toISOString() },
  });
  expect(snapshot()).toEqual({
    ...before,
    image: { ...before.image, trashedAt: oldTrash },
  });
  expect(await readFile(originalPath)).toEqual(bytes);
  const restored = { status: 200, body: { imageId, trashedAt: null } };
  expect(await mutate('restore')).toEqual(restored);
  expect(await mutate('restore')).toEqual(restored);
  expect(snapshot()).toEqual(before);
  expect(connection.db.select().from(storageConfigs).get()!.enabled).toBe(
    false,
  );
  expect(await readFile(originalPath)).toEqual(bytes);
}, 30000);

it('reports deletion conflicts and real database faults without changing the asset', async () => {
  await mutate('trash');
  for (const deletionStatus of ['deleting', 'cleanup_failed'] as const) {
    connection.db.update(mediaImages).set({ deletionStatus }).run();
    const before = snapshot();
    for (const operation of ['trash', 'restore'] as const) {
      const result = await mutate(operation);
      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({ code: 'MEDIA_DELETION_STARTED' });
      expect(snapshot()).toEqual(before);
    }
  }
  connection.db.update(mediaImages).set({ deletionStatus: null }).run();
  for (const operation of ['restore', 'trash'] as const) {
    const before = snapshot();
    const logOffset = server.logs().length;
    connection.db.$client.exec(
      "CREATE TRIGGER reject_trash_write BEFORE UPDATE OF trashed_at ON media_images BEGIN SELECT RAISE(ABORT, 'injected trash HTTP failure'); END",
    );
    try {
      expect((await mutate(operation)).status).toBe(500);
      expect(snapshot()).toEqual(before);
      await vi.waitFor(() =>
        expect(server.logs().slice(logOffset)).toContain(
          'injected trash HTTP failure',
        ),
      );
    } finally {
      connection.db.$client.exec('DROP TRIGGER reject_trash_write');
    }
    expect((await mutate(operation)).status).toBe(200);
  }
  expect(await readFile(originalPath)).toEqual(bytes);
});
