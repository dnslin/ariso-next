import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { performBackupWork } from '../../../src/server/backup/work.ts';
import { decryptArchiveFile } from '../../../src/server/backup/decrypt.ts';
import {
  readArchiveEntry,
  inspectArchive,
} from '../../../src/server/backup/read.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';

let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
let server: ReturnType<typeof createServer>;
let objects: Map<string, Buffer>;
let requests: string[];
let mode:
  'normal' | 'missing' | 'size' | 'truncated' | 'hold' | 'chunked' | 'short';
let responseClosed: Promise<void>;
let seenRequest: Promise<void>;
let signalRequest: () => void;
const remoteId = 'remote-source';
const fileName = 'saved.zip.age';
const password = '独立 backup password';
const entry = (id: string) =>
  `objects/${remoteId}/images/${id}/original/saved.jpg`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-s3-backup-'));
  fixture = createBackupDataFixture(join(root, 'source'));
  objects = new Map();
  requests = [];
  mode = 'normal';
  seenRequest = new Promise((resolve) => {
    signalRequest = resolve;
  });
  server = createServer((request, response) => {
    const path = decodeURIComponent(
      new URL(request.url!, 'http://fixture').pathname,
    );
    requests.push(`${request.method} ${path}`);
    const bytes = objects.get(path);
    responseClosed = new Promise((resolve) => response.once('close', resolve));
    signalRequest();
    if (mode === 'missing' || !bytes || request.method !== 'GET') {
      response.writeHead(404, { 'Content-Type': 'application/xml' });
      response.end(
        '<Error><Code>NoSuchKey</Code><Message>Missing retained object</Message></Error>',
      );
      return;
    }
    const body =
      mode === 'size' ? Buffer.concat([bytes, Buffer.from('x')]) : bytes;
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      ...(mode === 'chunked' || mode === 'short'
        ? {}
        : { 'Content-Length': String(body.length) }),
    });
    if (mode === 'chunked' || mode === 'short') {
      response.flushHeaders();
      response.end(mode === 'short' ? body.subarray(0, 1) : body);
      return;
    }
    if (mode === 'hold' || mode === 'truncated') {
      response.flushHeaders();
      response.write(body.subarray(0, 1));
      if (mode === 'truncated') setImmediate(() => response.destroy());
    } else response.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP fixture');
  const crypto = createSecretCrypto(fixtureKey);
  fixture.db
    .insert(storageConfigs)
    .values({
      id: remoteId,
      name: '旧 S3（停用）',
      type: 's3',
      enabled: false,
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'source-bucket',
      pathPrefix: '旧图片 + %',
      forcePathStyle: true,
      accessKeyEncrypted: crypto.encryptSecret('source-access'),
      secretKeyEncrypted: crypto.encryptSecret('source-secret'),
      connectionStatus: 'passed',
      connectionRevision: 1,
      corsStatus: 'passed',
      corsRevision: 1,
      corsOrigin: 'https://old.example.test',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  await mkdir(join(root, 'job'));
});
afterEach(async () => {
  const closing = once(server, 'close');
  server.closeAllConnections();
  server.close();
  await closing;
  fixture.close();
  await rm(root, { recursive: true, force: true });
});
async function addRemote(
  id: string,
  text: string,
  options: Parameters<typeof fixture.addImage>[2] = {},
) {
  const image = fixture.addImage(id, text, options);
  fixture.db.$client.transaction(() => {
    fixture.db.$client.pragma('defer_foreign_keys = ON');
    fixture.db.$client
      .prepare('UPDATE media_images SET storage_id=? WHERE id=?')
      .run(remoteId, id);
    fixture.db.$client
      .prepare('UPDATE media_objects SET storage_id=? WHERE image_id=?')
      .run(remoteId, id);
  })();
  await rm(image.path, { force: true });
  if (!options.deleting)
    objects.set(
      `/source-bucket/旧图片 + %/ariso/${remoteId}/${image.key}`,
      Buffer.from(text),
    );
}
const run = (signal = new AbortController().signal) =>
  performBackupWork(
    {
      kind: 'backup',
      jobDirectory: join(root, 'job'),
      dataDir: fixture.paths.dataDir,
      fileName,
      application: fixtureApplication,
      encryptionKey: fixtureKey,
      password,
    },
    signal,
    () => {},
  );

it('backs up real Local/S3 bytes including disabled storage, recycled media and queued dependencies, without scanning or modifying the source', async () => {
  const local = fixture.addImage('local-image', 'local bytes');
  await addRemote('远端-image', 'remote original');
  await addRemote('trashed-image', 'remote trash', { trashed: true });
  await addRemote('queued-image', 'remote queued', { jobStatus: 'queued' });
  await addRemote('deleted-image', 'gone', { deleting: true });
  const sourceConfig = fixture.db.$client
    .prepare('SELECT * FROM storage_configs WHERE id=?')
    .get(remoteId);
  const result = await run();
  expect(
    fixture.db.$client
      .prepare('SELECT * FROM storage_configs WHERE id=?')
      .get(remoteId),
  ).toEqual(sourceConfig);
  expect(result).toMatchObject({
    kind: 'backup',
    summary: { images: 5, trashedImages: 1, objects: 4 },
  });
  expect(result.summary.storages).toContainEqual({
    id: remoteId,
    name: '旧 S3（停用）',
    type: 's3',
    enabled: false,
    images: 4,
    objects: 3,
    bytes: 40,
  });
  const zip = join(root, 'content.zip');
  await decryptArchiveFile({
    source: join(root, 'job', fileName),
    destination: zip,
    password,
  });
  expect(
    await readArchiveEntry(zip, `objects/${fixture.storage.id}/${local.key}`, {
      maxBytes: 1024,
    }),
  ).toEqual(Buffer.from('local bytes'));
  for (const [id, text] of [
    ['远端-image', 'remote original'],
    ['trashed-image', 'remote trash'],
    ['queued-image', 'remote queued'],
  ])
    expect(await readArchiveEntry(zip, entry(id), { maxBytes: 1024 })).toEqual(
      Buffer.from(text),
    );
  expect(
    (await inspectArchive(zip)).entries.map((item) => item.name),
  ).not.toContain(entry('deleted-image'));
  expect(requests).toHaveLength(3);
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
  expect(requests.some((request) => request.includes('deleted-image'))).toBe(
    false,
  );
  expect(
    fixture.db.$client
      .prepare('SELECT enabled FROM storage_configs WHERE id=?')
      .get(remoteId),
  ).toEqual({ enabled: 0 });
  expect(await readFile(local.path, 'utf8')).toBe('local bytes');
}, 15000);

it.each(['missing', 'size', 'truncated', 'short'] as const)(
  'fails the complete backup on a %s S3 object instead of publishing a partial file',
  async (failure) => {
    await addRemote('remote-image', 'required remote bytes');
    mode = failure;
    await expect(run()).rejects.toMatchObject({
      code:
        failure === 'missing'
          ? 'BACKUP_OBJECT_MISSING'
          : failure === 'size'
            ? 'BACKUP_OBJECT_INVALID'
            : failure === 'short'
              ? 'BACKUP_INVALID_ARCHIVE'
              : 'STORAGE_OPERATION_FAILED',
    });
    expect(existsSync(join(root, 'job', fileName))).toBe(false);
    expect(existsSync(join(root, 'job', `${fileName}.part`))).toBe(false);
    expect(requests).toHaveLength(1);
  },
  15000,
);

it('cancels an in-flight remote read and closes its HTTP response', async () => {
  await addRemote('remote-image', 'required remote bytes');
  mode = 'hold';
  const controller = new AbortController();
  const result = run(controller.signal).then(
    () => null,
    (error: unknown) => error,
  );
  await seenRequest;
  controller.abort(new Error('cancel source backup'));
  expect(await result).toMatchObject({ message: 'cancel source backup' });
  await responseClosed;
  expect(existsSync(join(root, 'job', fileName))).toBe(false);
  expect(existsSync(join(root, 'job', `${fileName}.part`))).toBe(false);
}, 15000);

it('accepts an S3 body without Content-Length only when its actual archived length matches the saved object', async () => {
  await addRemote('remote-image', 'required remote bytes');
  mode = 'chunked';
  const result = await run();
  expect(result).toMatchObject({ kind: 'backup', summary: { objects: 1 } });
  const zip = join(root, 'content.zip');
  await decryptArchiveFile({
    source: join(root, 'job', fileName),
    destination: zip,
    password,
  });
  expect(
    await readArchiveEntry(zip, entry('remote-image'), { maxBytes: 1024 }),
  ).toEqual(Buffer.from('required remote bytes'));
  expect(requests).toHaveLength(1);
}, 15000);
