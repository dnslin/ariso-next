import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  patchMediaSettings,
} from '../../../src/server/media/settings.ts';
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
let origin: string;
let cookie: string;
let token: string;
let imageId: string;
let original: Buffer;
let originalPath: string;
async function ready() {
  await vi.waitFor(
    async () => {
      if (server.child.exitCode !== null) throw new Error(server.logs());
      expect(
        (
          await fetch(`http://127.0.0.1:${server.port}/api/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).status,
      ).toBe(200);
    },
    { timeout: 15000 },
  );
}
async function request(
  body = '{}',
  headers: Record<string, string> = {},
  id = imageId,
) {
  const response = await fetch(`${origin}/api/images/${id}/reprocess`, {
    method: 'POST',
    headers: { origin, cookie, 'content-type': 'application/json', ...headers },
    body,
    signal: AbortSignal.timeout(10000),
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  return { status: response.status, body: await response.json() };
}
function snapshot() {
  return {
    images: connection.db.select().from(mediaImages).all(),
    objects: connection.db.select().from(mediaObjects).all(),
    versions: connection.db.select().from(mediaVersions).all(),
    jobs: connection.db.select().from(mediaJobs).all(),
  };
}
function currentVersions() {
  return connection.db
    .select()
    .from(mediaVersions)
    .where(eq(mediaVersions.imageId, imageId))
    .all();
}
async function settled(jobId: string) {
  await vi.waitFor(
    () =>
      expect(
        connection.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.id, jobId))
          .get(),
        server.logs(),
      ).toMatchObject({ status: 'succeeded' }),
    { timeout: 15000 },
  );
}
async function publicBytes(kind: 'original' | 'compressed' | 'thumbnail') {
  const response = await fetch(`${origin}/i/${imageId}?type=${kind}`, {
    signal: AbortSignal.timeout(10000),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('x-ariso-image-version')).toBe(kind);
  return Buffer.from(await response.arrayBuffer());
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-reprocess-http-'));
  const env = {
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
  const write = planLocalWrite('uploads');
  const storageRoot = join(env.DATA_DIR, 'storage');
  original = await readFile(
    resolve('tests/fixtures/runtime/images/sample.png'),
  );
  await writeObject(storageRoot, storage, write, Readable.from(original));
  originalPath = join(
    storageRoot,
    storage.localPath,
    'ariso',
    storage.id,
    write.key,
  );
  imageId = randomUUID();
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId,
      storageId: storage.id,
      key: write.key,
      originalName: 'HTTP-original.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: original.length,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
  await settled(accepted.jobId);
}, 30000);
afterEach(async () => {
  if (server) await stop(server.child, server.closed);
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('requires the owner Cookie and saved Origin and creates no job for denied requests', async () => {
  const before = snapshot();
  const deniedHeaders: Record<string, string>[] = [
    { cookie: '' },
    { cookie: '', authorization: `Bearer ${token}` },
    { cookie: `ariso.share_token=${encodeURIComponent(token)}` },
  ];
  for (const headers of deniedHeaders)
    expect(await request('{}', headers)).toMatchObject({
      status: 401,
      body: { code: 'UNAUTHORIZED' },
    });
  for (const requestOrigin of ['', 'https://foreign.example'])
    expect(await request('{}', { origin: requestOrigin })).toMatchObject({
      status: 403,
      body: { code: 'INVALID_ORIGIN' },
    });
  expect(await request('{}', {}, 'missing')).toMatchObject({
    status: 404,
    body: { code: 'MEDIA_IMAGE_NOT_FOUND' },
  });
  expect(snapshot()).toEqual(before);
});

it('rejects malformed JSON, unsupported scopes and client processing parameters', async () => {
  const before = snapshot();
  expect((await request('{')).status).toBe(400);
  for (const body of [
    'null',
    '[]',
    '{"scope":"original"}',
    '{"scope":null}',
    '{"scope":"all","quality":20}',
    '{"args":["-fast"]}',
  ])
    expect((await request(body)).status).toBe(422);
  expect(snapshot()).toEqual(before);
});

it('reports lifecycle, switch, failed-scope and queued-job conflicts', async () => {
  for (const patch of [
    { trashedAt: new Date() },
    { deletionStatus: 'deleting' as const },
    { deletionStatus: 'cleanup_failed' as const },
  ]) {
    connection.db.update(mediaImages).set(patch).run();
    const before = snapshot();
    expect(await request()).toMatchObject({
      status: 409,
      body: { code: 'MEDIA_IMAGE_UNAVAILABLE' },
    });
    expect(snapshot()).toEqual(before);
    connection.db
      .update(mediaImages)
      .set({ trashedAt: null, deletionStatus: null })
      .run();
  }
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  expect(await request()).toMatchObject({
    status: 409,
    body: { code: 'STORAGE_DISABLED' },
  });
  connection.db.update(storageConfigs).set({ enabled: true }).run();
  patchMediaSettings(connection.db, {
    compressionEnabled: false,
    defaultLinkVersion: 'original',
  });
  for (const scope of ['compressed', 'watermark'])
    expect(await request(JSON.stringify({ scope }))).toMatchObject({
      status: 409,
      body: { code: 'MEDIA_REPROCESS_DISABLED' },
    });
  connection.db.update(mediaImages).set({ processingStatus: 'failed' }).run();
  expect(await request('{"scope":"thumbnail"}')).toMatchObject({
    status: 409,
    body: { code: 'MEDIA_REPROCESS_SCOPE' },
  });
  connection.db.update(mediaImages).set({ processingStatus: 'ready' }).run();
  connection.db.$client.exec(
    'CREATE TRIGGER hold_reprocess_job AFTER INSERT ON media_jobs BEGIN UPDATE media_jobs SET next_attempt_at=4102444800000 WHERE id=NEW.id; END',
  );
  const accepted = await request('{"scope":"thumbnail"}');
  expect(accepted).toMatchObject({
    status: 202,
    body: { jobId: expect.any(String), status: 'queued' },
  });
  const before = snapshot();
  expect(await request('{"scope":"thumbnail"}')).toMatchObject({
    status: 409,
    body: { code: 'MEDIA_JOB_CONFLICT' },
  });
  expect(snapshot()).toEqual(before);
});

it('keeps old HTTP links readable throughout ready processing and publishes all selected references together', async () => {
  const before = currentVersions();
  const oldBytes = await publicBytes('compressed');
  patchMediaSettings(connection.db, {
    outputFormat: 'jpeg',
    quality: 47,
    maxEdge: 32,
  });
  connection.db.$client.exec(
    'CREATE TRIGGER hold_reprocess_job AFTER INSERT ON media_jobs BEGIN UPDATE media_jobs SET next_attempt_at=4102444800000 WHERE id=NEW.id; END',
  );
  const accepted = await request();
  expect(accepted).toMatchObject({
    status: 202,
    body: { jobId: expect.any(String), status: 'queued' },
  });
  const jobId = accepted.body.jobId as string;
  expect(await publicBytes('compressed')).toEqual(oldBytes);
  expect(connection.db.select().from(mediaImages).get()!.processingStatus).toBe(
    'ready',
  );
  patchMediaSettings(connection.db, { outputFormat: 'avif', maxEdge: 16 });
  connection.db
    .update(mediaJobs)
    .set({ nextAttemptAt: null })
    .where(eq(mediaJobs.id, jobId))
    .run();
  let oldReads = 0;
  let activeReads = 0;
  while (true) {
    const processing = connection.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, jobId))
      .get()!;
    if (!['queued', 'running'].includes(processing.status)) break;
    expect(
      connection.db.select().from(mediaImages).get()!.processingStatus,
    ).toBe('ready');
    const refsBefore = currentVersions();
    const delivered = await publicBytes('compressed');
    const refsAfter = currentVersions();
    if (
      refsAfter.find((row) => row.kind === 'compressed')!.objectId ===
      before.find((row) => row.kind === 'compressed')!.objectId
    ) {
      expect(delivered).toEqual(oldBytes);
      oldReads++;
    }
    if (processing.status === 'running') activeReads++;
    for (const refs of [refsBefore, refsAfter]) {
      const changed = refs
        .filter((row) => row.kind !== 'original')
        .map(
          (row) =>
            row.objectId !==
            before.find((old) => old.kind === row.kind)!.objectId,
        );
      expect(changed.every(Boolean) || changed.every((value) => !value)).toBe(
        true,
      );
    }
  }
  await settled(jobId);
  expect(oldReads).toBeGreaterThan(0);
  expect(activeReads).toBeGreaterThan(0);
  const now = currentVersions();
  expect(now.find((row) => row.kind === 'original')).toEqual(
    before.find((row) => row.kind === 'original'),
  );
  expect(now.find((row) => row.kind === 'compressed')).toMatchObject({
    width: 32,
    height: 24,
    mime: 'image/jpeg',
  });
  expect((await publicBytes('compressed')).subarray(0, 2)).toEqual(
    Buffer.from([0xff, 0xd8]),
  );
  expect(await publicBytes('original')).toEqual(original);
  expect(await readFile(originalPath)).toEqual(original);
}, 20000);

it('preserves old HTTP bytes when atomic publication fails and records the readable failure', async () => {
  const before = currentVersions();
  const oldBytes = await publicBytes('compressed');
  connection.db.$client.exec(
    "CREATE TRIGGER reject_reprocess_publish BEFORE UPDATE OF object_id ON media_versions WHEN NEW.kind='thumbnail' BEGIN SELECT RAISE(ABORT, 'injected HTTP candidate publication failure'); END",
  );
  const accepted = await request();
  expect(accepted.status).toBe(202);
  await vi.waitFor(
    () =>
      expect(
        connection.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.id, accepted.body.jobId))
          .get(),
        server.logs(),
      ).toMatchObject({
        status: 'failed',
        error: expect.stringContaining(
          'injected HTTP candidate publication failure',
        ),
      }),
    { timeout: 15000 },
  );
  expect(currentVersions()).toEqual(before);
  expect(await publicBytes('compressed')).toEqual(oldBytes);
  expect(await publicBytes('original')).toEqual(original);
  expect(connection.db.select().from(mediaImages).get()!.processingStatus).toBe(
    'ready',
  );
  const candidates = connection.db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, accepted.body.jobId),
        eq(mediaObjects.purpose, 'compressed'),
      ),
    )
    .all();
  expect(candidates).toHaveLength(1);
  expect(['cleanup_pending', 'cleanup_failed', 'deleted']).toContain(
    candidates[0].status,
  );
}, 20000);

it('returns a logged persistence failure without mutating existing content or jobs', async () => {
  const before = snapshot();
  const logOffset = server.logs().length;
  connection.db.$client.exec(
    "CREATE TRIGGER reject_reprocess_job BEFORE INSERT ON media_jobs BEGIN SELECT RAISE(ABORT, 'injected reprocess HTTP persistence failure'); END",
  );
  expect(await request()).toMatchObject({
    status: 500,
    body: { code: 'INTERNAL_SERVER_ERROR' },
  });
  expect(snapshot()).toEqual(before);
  expect(await readFile(originalPath)).toEqual(original);
  await vi.waitFor(() =>
    expect(server.logs().slice(logOffset)).toContain(
      'injected reprocess HTTP persistence failure',
    ),
  );
});

it.each(['disabled', 'deleting'] as const)(
  'rejects final HTTP-worker publication after %s occurs with all candidates saved',
  async (condition) => {
    const before = currentVersions();
    const oldBytes = await publicBytes('compressed');
    const change =
      condition === 'disabled'
        ? 'UPDATE storage_configs SET enabled=0'
        : "UPDATE media_images SET deletion_status='deleting'";
    connection.db.$client.exec(
      `CREATE TRIGGER change_before_final_publish AFTER UPDATE OF status ON media_objects WHEN NEW.status='stored' AND NEW.purpose='thumbnail' BEGIN ${change}; END`,
    );
    const accepted = await request();
    expect(accepted.status).toBe(202);
    await vi.waitFor(
      () =>
        expect(
          connection.db
            .select()
            .from(mediaJobs)
            .where(eq(mediaJobs.id, accepted.body.jobId))
            .get(),
          server.logs(),
        ).toMatchObject({
          status: 'failed',
          error: expect.stringContaining(
            condition === 'disabled'
              ? 'STORAGE_DISABLED'
              : 'MEDIA_IMAGE_DELETING',
          ),
        }),
      { timeout: 15000 },
    );
    expect(currentVersions()).toEqual(before);
    expect(
      connection.db.select().from(mediaImages).get()!.processingStatus,
    ).toBe('ready');
    const refused = await fetch(`${origin}/i/${imageId}?type=compressed`);
    expect(refused.status).toBe(condition === 'disabled' ? 409 : 404);
    connection.db.update(storageConfigs).set({ enabled: true }).run();
    connection.db.update(mediaImages).set({ deletionStatus: null }).run();
    expect(await publicBytes('compressed')).toEqual(oldBytes);
    expect(await readFile(originalPath)).toEqual(original);
  },
  20000,
);
