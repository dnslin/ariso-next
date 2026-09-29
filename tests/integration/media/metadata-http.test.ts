import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestMetadataRead } from '../../../src/server/media/metadata.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaMetadata,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { resolveLocalUploadStorage } from '../../../src/server/storage/defaults.ts';
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

async function requestRead(
  id = imageId,
  headers: Record<string, string> = {},
  body?: string,
) {
  const response = await fetch(`${origin}/api/images/${id}/metadata/read`, {
    method: 'POST',
    headers: { origin, cookie, ...headers },
    body,
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
    metadata: connection.db.select().from(mediaMetadata).all(),
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-metadata-http-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    PATH: process.env.PATH!,
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
  const storage = resolveLocalUploadStorage(connection.db);
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
    // This tests metadata reread HTTP, not prior image processing.
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

it('requires the owner Cookie and saved origin before accepting a metadata reread', async () => {
  const before = snapshot();
  const anonymousHeaders: Record<string, string>[] = [
    { cookie: '' },
    { cookie: '', authorization: `Bearer ${token}` },
    { cookie: `ariso.share_token=${encodeURIComponent(token)}` },
  ];
  for (const headers of anonymousHeaders) {
    expect(await requestRead(imageId, headers)).toMatchObject({
      status: 401,
      body: { code: 'UNAUTHORIZED' },
    });
  }
  for (const requestOrigin of ['', 'https://foreign.example']) {
    expect(await requestRead(imageId, { origin: requestOrigin })).toMatchObject(
      {
        status: 403,
        body: { code: 'INVALID_ORIGIN' },
      },
    );
  }
  expect(await requestRead('missing')).toMatchObject({
    status: 404,
    body: { code: 'MEDIA_IMAGE_NOT_FOUND' },
  });
  expect(snapshot()).toEqual(before);
});

it('rejects every nonempty request body without passing client tool options to the queue', async () => {
  const before = snapshot();
  for (const body of ['{}', '{"args":["-fast"]}', 'null', ' ', '{']) {
    expect(
      await requestRead(imageId, { 'content-type': 'application/json' }, body),
    ).toMatchObject({
      status: 422,
      body: { code: 'INVALID_METADATA_READ_INPUT' },
    });
  }
  expect(snapshot()).toEqual(before);
  expect(await readFile(originalPath)).toEqual(bytes);
});

it('reports image lifecycle, active processing, and disabled storage conflicts without adding jobs', async () => {
  for (const patch of [
    { trashedAt: new Date() },
    { deletionStatus: 'deleting' as const },
    { deletionStatus: 'cleanup_failed' as const },
  ]) {
    connection.db.update(mediaImages).set(patch).run();
    const before = snapshot();
    expect((await requestRead()).status).toBe(409);
    expect(snapshot()).toEqual(before);
    connection.db
      .update(mediaImages)
      .set({ trashedAt: null, deletionStatus: null })
      .run();
  }
  connection.db
    .update(mediaJobs)
    .set({
      status: 'queued',
      nextAttemptAt: new Date('2100-01-01T00:00:00Z'),
    })
    .run();
  const active = snapshot();
  expect((await requestRead()).status).toBe(409);
  expect(snapshot()).toEqual(active);
  connection.db
    .update(mediaJobs)
    .set({ status: 'failed', nextAttemptAt: null })
    .run();
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  const disabled = snapshot();
  expect((await requestRead()).status).toBe(409);
  expect(snapshot()).toEqual(disabled);
  expect(await readFile(originalPath)).toEqual(bytes);
});

it('returns the same already queued metadata job on repeated HTTP requests', async () => {
  const job = connection.db.transaction((tx) => {
    const accepted = requestMetadataRead(tx, imageId);
    tx.update(mediaJobs)
      .set({ nextAttemptAt: new Date('2100-01-01T00:00:00Z') })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    return accepted;
  });
  const before = snapshot();
  expect(await requestRead()).toEqual({ status: 202, body: job });
  expect(await requestRead()).toEqual({ status: 202, body: job });
  expect(snapshot()).toEqual(before);
});

it('reads metadata through the real HTTP worker without changing original bytes or image versions', async () => {
  const before = snapshot();
  const accepted = await requestRead();
  expect(accepted).toEqual({
    status: 202,
    body: { jobId: expect.any(String), status: 'queued' },
  });
  await vi.waitFor(
    () => {
      const job = connection.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, accepted.body.jobId))
        .get();
      expect(job, server.logs()).toMatchObject({
        kind: 'metadata',
        status: 'succeeded',
        expectedVersions: [],
      });
    },
    { timeout: 15000 },
  );
  const after = snapshot();
  expect(after.image).toEqual(before.image);
  expect(after.objects).toEqual(before.objects);
  expect(after.versions).toEqual(before.versions);
  expect(after.jobs).toHaveLength(before.jobs.length + 1);
  expect(after.metadata).toEqual([
    expect.objectContaining({
      imageId,
      status: 'succeeded',
      data: expect.objectContaining({
        'PNG:Main:ImageWidth': '64',
        'PNG:Main:ImageHeight': '48',
        'File:Main:MIMEType': 'image/png',
      }),
      readAt: expect.any(Date),
      attemptedAt: expect.any(Date),
      error: null,
    }),
  ]);
  expect(await readFile(originalPath)).toEqual(bytes);
}, 20000);

it('returns a logged server error when persistence fails without changing the asset', async () => {
  const before = snapshot();
  const logOffset = server.logs().length;
  connection.db.$client
    .exec(`CREATE TRIGGER reject_metadata_fixture BEFORE INSERT ON media_jobs
    WHEN NEW.kind = 'metadata'
    BEGIN SELECT RAISE(ABORT, 'injected metadata HTTP failure'); END`);
  expect(await requestRead()).toMatchObject({
    status: 500,
    body: { code: 'INTERNAL_SERVER_ERROR' },
  });
  expect(snapshot()).toEqual(before);
  expect(await readFile(originalPath)).toEqual(bytes);
  await vi.waitFor(() =>
    expect(server.logs().slice(logOffset)).toContain(
      'injected metadata HTTP failure',
    ),
  );
});
