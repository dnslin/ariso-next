import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAlbum } from '../../../src/server/collections/records.ts';
import {
  albumImages,
  imageTags,
  tags,
} from '../../../src/server/collections/schema.ts';
import { apikey } from '../../../src/server/identity/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  mediaSettings,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
import { publicUploadFixture, responseWithoutBody } from './api-fixture.ts';

let fixture: Awaited<ReturnType<typeof publicUploadFixture>>;
let key: string;
const clockCase =
  'returns actual HTTP 504 after the production wait budget without failing or cancelling the accepted job';

async function errorResult(response: Response, status: number, stage?: string) {
  expect(response.status, await response.clone().text()).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const result = await response.json();
  expect(result).toMatchObject({
    imageId: null,
    status: 'not_created',
    error: {
      code: expect.stringMatching(/^[A-Z][A-Z0-9_]+$/),
      stage: stage ?? expect.any(String),
      message: expect.any(String),
    },
    requestId: expect.any(String),
  });
  expect(result.error.message.length).toBeGreaterThan(0);
  expect(result.error.stage.length).toBeGreaterThan(0);
  expect(result.requestId.length).toBeGreaterThan(0);
  return result;
}

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

async function noAssetsOrTemporaryFiles() {
  const { db } = fixture.connection;
  expect(db.select().from(mediaImages).all()).toEqual([]);
  expect(db.select().from(mediaJobs).all()).toEqual([]);
  expect(db.select().from(mediaObjects).all()).toEqual([]);
  expect(await files(join(fixture.dataDir, 'storage'))).toEqual([]);
  expect(await files(join(fixture.dataDir, 'tmp'))).toEqual([]);
}

beforeEach(async ({ task }) => {
  fixture = await publicUploadFixture(undefined, {
    clock: task.name === clockCase,
  });
  key = (await fixture.createToken()).key;
}, 30000);

it(
  clockCase,
  async () => {
    const { db } = fixture.connection;
    const controller = new AbortController();
    // Only the service clock advances; the HTTP client and its deadlines use real time.
    db.$client.exec(
      `CREATE TRIGGER hold_timeout_api_job AFTER INSERT ON media_jobs WHEN NEW.kind = 'process' BEGIN UPDATE media_jobs SET next_attempt_at = ${Date.now() + 3600000} WHERE id = NEW.id; END`,
    );
    const startedAt = Date.now();
    const responsePromise = fixture
      .request('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: fixture.form(),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30000),
        ]),
      })
      .then(
        (response) => ({ response, error: null }),
        (error: Error) => ({ response: null, error }),
      );
    try {
      await vi.waitFor(
        () => {
          expect(fixture.server.logs()).toContain('Upload accepted');
          expect(db.select().from(mediaJobs).get()).toMatchObject({
            status: 'queued',
            error: null,
          });
        },
        { timeout: 10000 },
      );
      const imageId = db.select().from(mediaImages).get()!.id;
      const jobId = db.select().from(mediaJobs).get()!.id;
      fixture.advanceClock();
      const completed = await responsePromise;
      expect(completed.error).toBeNull();
      const response = completed.response!;
      expect(response.status, await response.clone().text()).toBe(504);
      expect(await response.json()).toMatchObject({
        imageId,
        status: 'pending',
        error: {
          code: 'UPLOAD_WAIT_TIMEOUT',
          stage: 'waiting',
          message: expect.any(String),
        },
        requestId: expect.any(String),
      });
      expect(Date.now() - startedAt).toBeLessThan(30000);
      expect(
        db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get(),
      ).toMatchObject({ status: 'queued', error: null });
      expect(db.select().from(mediaImages).get()).toMatchObject({
        id: imageId,
        processingStatus: 'pending',
      });
      db.update(mediaJobs)
        .set({ nextAttemptAt: null })
        .where(eq(mediaJobs.id, jobId))
        .run();
      await vi.waitFor(
        () => {
          expect(
            db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get(),
          ).toMatchObject({ imageId, status: 'succeeded' });
          expect(db.select().from(mediaImages).get()).toMatchObject({
            id: imageId,
            processingStatus: 'ready',
          });
        },
        { timeout: 10000 },
      );
      expect(db.select().from(mediaImages).all()).toHaveLength(1);
      expect(db.select().from(mediaJobs).all()).toHaveLength(1);
    } finally {
      controller.abort();
      db.$client.exec('DROP TRIGGER hold_timeout_api_job');
    }
  },
  30000,
);

afterEach(async () => {
  await fixture?.close();
});

it('rejects missing, Cookie, invalid, expired, disabled and revoked credentials before reading any body bytes', async () => {
  const expired = await fixture.createToken({ name: 'expired' });
  fixture.connection.db
    .update(apikey)
    .set({ expiresAt: new Date(Date.now() - 1) })
    .where(eq(apikey.id, expired.token.id))
    .run();
  const disabled = await fixture.createToken({ name: 'disabled' });
  expect(
    (
      await fixture.ownerJson(
        `/api/upload-tokens/${disabled.token.id}`,
        'PATCH',
        { enabled: false },
      )
    ).status,
  ).toBe(200);
  const revoked = await fixture.createToken({ name: 'revoked' });
  expect(
    (
      await fixture.ownerJson(
        `/api/upload-tokens/${revoked.token.id}`,
        'DELETE',
      )
    ).status,
  ).toBe(200);
  const credentials: Record<string, string>[] = [
    {},
    { cookie: fixture.cookie },
    { authorization: 'Bearer invalid-token' },
    { cookie: fixture.cookie, authorization: 'Bearer invalid-token' },
    { authorization: `Bearer ${expired.key}` },
    { authorization: `Bearer ${disabled.key}` },
    { authorization: `Bearer ${revoked.key}` },
    { 'x-api-key': key },
  ];
  for (const headers of credentials) {
    const result = await errorResult(
      await responseWithoutBody(fixture.origin, headers),
      401,
      'authentication',
    );
    expect(JSON.stringify(result)).not.toContain('invalid-token');
    expect(JSON.stringify(result)).not.toContain(key);
  }
  await noAssetsOrTemporaryFiles();
}, 30000);

it('authenticates more than ten requests with one fixed upload:create Token without default rate limiting', async () => {
  for (let attempt = 0; attempt < 15; attempt++) {
    await errorResult(
      await fixture.upload(key, new FormData()),
      400,
      'receiving',
    );
  }
  const row = fixture.connection.db.select().from(apikey).get()!;
  expect(row.permissions).toBe(JSON.stringify({ upload: ['create'] }));
  expect(row.rateLimitEnabled).toBe(false);
  expect(row.remaining).toBeNull();
  await noAssetsOrTemporaryFiles();
}, 30000);

it('returns 201 only with the completed persisted job, actual saved version links and original bytes', async () => {
  const response = await fixture.upload(key);
  expect(response.status, await response.clone().text()).toBe(201);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.getSetCookie()).toEqual([]);
  const result = await response.json();
  expect(result).toMatchObject({
    imageId: expect.any(String),
    status: 'ready',
    actualVersion: 'compressed',
    defaultResolution: { available: true, code: null },
    processing: { status: 'succeeded', warnings: expect.any(Array) },
  });
  expect(result.url).toBe(`${fixture.origin}/i/${result.imageId}`);
  const { db } = fixture.connection;
  const image = db.select().from(mediaImages).get()!;
  const job = db.select().from(mediaJobs).get()!;
  expect(image).toMatchObject({
    id: result.imageId,
    processingStatus: 'ready',
    mime: 'image/png',
  });
  expect(job).toMatchObject({ imageId: result.imageId, status: 'succeeded' });
  const saved = db.select().from(mediaVersions).all();
  expect(Object.keys(result.versions).sort()).toEqual(
    saved.map((version) => version.kind).sort(),
  );
  expect(Object.keys(result.versions).sort()).toEqual([
    'compressed',
    'original',
    'thumbnail',
  ]);
  for (const version of saved) {
    expect(result.versions[version.kind]).toMatchObject({
      url: `${fixture.origin}/i/${result.imageId}?type=${version.kind}`,
      mime: version.mime,
    });
  }
  const original = await fixture.request(`/i/${result.imageId}?type=original`);
  expect(original.status).toBe(200);
  expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
  expect(await files(join(fixture.dataDir, 'tmp'))).toEqual([]);
}, 30000);

it('parses file-first and arbitrary field order, deduplicates album IDs and matches or creates whole tag names', async () => {
  const { db } = fixture.connection;
  const a = db.transaction((tx) => createAlbum(tx, { name: '一' }))!;
  const b = db.transaction((tx) => createAlbum(tx, { name: '二' }))!;
  const storage = db.select().from(storageConfigs).get()!;
  const body = fixture.form();
  for (const [name, value] of [
    ['tag', 'Go'],
    ['albumId', a.id],
    ['visibility', 'private'],
    ['albumId', b.id],
    ['storageId', storage.id],
    ['tag', 'go'],
    ['albumId', a.id],
    ['tag', '旅行,夏天'],
  ])
    body.append(name, value);
  const response = await fixture.upload(key, body);
  expect(response.status, await response.clone().text()).toBe(201);
  const result = await response.json();
  expect(db.select().from(mediaImages).get()!.visibility).toBe('private');
  expect(
    db
      .select()
      .from(albumImages)
      .all()
      .map((row) => row.albumId)
      .sort(),
  ).toEqual([a.id, b.id].sort());
  const storedTags = db.select().from(tags).all();
  expect(storedTags.map((tag) => tag.displayName).sort()).toEqual([
    'Go',
    '旅行,夏天',
  ]);
  expect(db.select().from(imageTags).all()).toHaveLength(2);
  const unauthorized = await fixture.request(
    `/i/${result.imageId}?type=original`,
    {
      headers: { authorization: `Bearer ${key}` },
    },
  );
  expect(unauthorized.status).toBe(401);
  const original = await fixture.owner(`/i/${result.imageId}?type=original`);
  expect(original.status).toBe(200);
  expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
}, 30000);

it('rejects unknown fields, duplicate single fields, invalid selections and a second file without creating assets or tags', async () => {
  const cases: { fields: [string, string][]; status: number; code: string }[] =
    [
      {
        fields: [['unknown', 'value']],
        status: 400,
        code: 'UPLOAD_UNKNOWN_FIELD',
      },
      {
        fields: [['albumId[]', 'id']],
        status: 400,
        code: 'UPLOAD_UNKNOWN_FIELD',
      },
      {
        fields: [
          ['storageId', ''],
          ['tag', 'must-not-be-created'],
        ],
        status: 400,
        code: 'UPLOAD_INVALID_INPUT',
      },
      {
        fields: [
          ['storageId', 'id'],
          ['storageId', 'id'],
        ],
        status: 400,
        code: 'UPLOAD_DUPLICATE_FIELD',
      },
      {
        fields: [
          ['visibility', 'public'],
          ['visibility', 'private'],
        ],
        status: 400,
        code: 'UPLOAD_DUPLICATE_FIELD',
      },
      {
        fields: [['visibility', 'invalid']],
        status: 400,
        code: 'UPLOAD_INVALID_INPUT',
      },
      {
        fields: [['tag', 'x'.repeat(51)]],
        status: 400,
        code: 'UPLOAD_INVALID_INPUT',
      },
      {
        fields: [
          ['tag', 'valid'],
          ['albumId', 'absent-album'],
        ],
        status: 409,
        code: 'COLLECTION_TARGET_NOT_FOUND',
      },
    ];
  for (const { fields, status, code } of cases) {
    const response = await fixture.upload(key, fixture.form(fields));
    expect((await errorResult(response, status)).error.code).toBe(code);
    await noAssetsOrTemporaryFiles();
    expect(fixture.connection.db.select().from(tags).all()).toEqual([]);
  }
  const secondFile = fixture.form();
  secondFile.append(
    'file',
    new Blob([new Uint8Array(fixture.bytes)]),
    'second.png',
  );
  expect(
    (await errorResult(await fixture.upload(key, secondFile), 400, 'receiving'))
      .error.code,
  ).toBe('UPLOAD_EXTRA_FILE');
  await noAssetsOrTemporaryFiles();
  const badName = new FormData();
  badName.append(
    'file',
    new Blob([new Uint8Array(fixture.bytes)]),
    `${'x'.repeat(256)}.png`,
  );
  expect(
    (await errorResult(await fixture.upload(key, badName), 400, 'receiving'))
      .error.code,
  ).toBe('UPLOAD_INVALID_NAME');
  await noAssetsOrTemporaryFiles();
}, 30000);

it('rejects truncated multipart, missing files, field byte limits and configured file size limits, then removes all temporary files', async () => {
  const boundary = 'ariso-api-truncated';
  const truncated = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    fixture.bytes,
  ]);
  await errorResult(
    await fixture.request('/api/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: truncated,
    }),
    400,
    'receiving',
  );
  await noAssetsOrTemporaryFiles();
  await errorResult(
    await fixture.upload(key, new FormData()),
    400,
    'receiving',
  );
  await noAssetsOrTemporaryFiles();
  const largeField = fixture.form([['tag', 'x'.repeat(256 * 1024 + 1)]]);
  const fieldError = await fixture.upload(key, largeField);
  expect([400, 413]).toContain(fieldError.status);
  await errorResult(fieldError, fieldError.status, 'receiving');
  await noAssetsOrTemporaryFiles();
  const aggregateFields = fixture.form();
  for (let index = 0; index < 5300; index++)
    aggregateFields.append('tag', 'x'.repeat(50));
  const aggregateError = await fixture.upload(key, aggregateFields);
  expect([400, 413]).toContain(aggregateError.status);
  await errorResult(aggregateError, aggregateError.status, 'receiving');
  await noAssetsOrTemporaryFiles();
  fixture.connection.db
    .update(uploadSettings)
    .set({ maxFileBytes: fixture.bytes.length - 1 })
    .run();
  await errorResult(await fixture.upload(key), 413, 'receiving');
  await noAssetsOrTemporaryFiles();
}, 30000);

it('a Token revoked after admission does not cancel the accepted request but rejects its next POST', async () => {
  const { db } = fixture.connection;
  db.$client.exec(
    'CREATE TRIGGER revoke_admitted_api_token AFTER INSERT ON upload_submissions BEGIN DELETE FROM apikey; END',
  );
  try {
    const response = await fixture.upload(key);
    expect(response.status, await response.clone().text()).toBe(201);
    const result = await response.json();
    expect(result.status).toBe('ready');
    expect(db.select().from(mediaImages).get()).toMatchObject({
      id: result.imageId,
      processingStatus: 'ready',
    });
    await errorResult(await fixture.upload(key), 401, 'authentication');
    expect(db.select().from(mediaImages).all()).toHaveLength(1);
    expect(db.select().from(mediaJobs).all()).toHaveLength(1);
  } finally {
    db.$client.exec('DROP TRIGGER revoke_admitted_api_token');
  }
}, 30000);

it('a default changed after submission to a missing watermark keeps ready/201 with unavailable default and working saved links', async () => {
  const { db } = fixture.connection;
  db.$client.exec(
    "CREATE TRIGGER change_api_default AFTER INSERT ON media_jobs BEGIN UPDATE media_settings SET watermark_mode='text', watermark_text='future watermark', default_link_version='watermark'; END",
  );
  try {
    const response = await fixture.upload(key);
    expect(response.status, await response.clone().text()).toBe(201);
    const result = await response.json();
    expect(result).toMatchObject({
      status: 'ready',
      actualVersion: null,
      defaultResolution: { available: false, code: 'VERSION_UNAVAILABLE' },
    });
    expect(Object.keys(result.versions).sort()).toEqual([
      'compressed',
      'original',
      'thumbnail',
    ]);
    expect((await fixture.request(`/i/${result.imageId}`)).status).toBe(404);
    const original = await fixture.request(
      `/i/${result.imageId}?type=original`,
    );
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
  } finally {
    db.$client.exec('DROP TRIGGER change_api_default');
  }
}, 30000);

it('retains tags after valid preparation and unsupported-image failure, but returns no image ID or asset', async () => {
  const response = await fixture.upload(
    key,
    fixture.form([['tag', 'retained']], Buffer.from([0, 1, 2, 3, 255])),
  );
  await errorResult(response, 415, 'validating');
  await noAssetsOrTemporaryFiles();
  expect(fixture.connection.db.select().from(tags).all()).toMatchObject([
    { displayName: 'retained' },
  ]);
}, 30000);

it('returns a real failed image and failed step while retaining original and earlier saved versions', async () => {
  const { db } = fixture.connection;
  db.$client.exec(
    "CREATE TRIGGER fail_api_thumbnail BEFORE INSERT ON media_versions WHEN NEW.kind = 'thumbnail' BEGIN SELECT RAISE(ABORT, 'controlled API thumbnail publication failure'); END",
  );
  try {
    const response = await fixture.upload(key);
    expect(response.status, await response.clone().text()).toBe(422);
    const result = await response.json();
    expect(result).toMatchObject({
      imageId: expect.any(String),
      status: 'failed',
      error: {
        code: expect.any(String),
        stage: 'thumbnail',
        message: expect.stringContaining(
          'controlled API thumbnail publication failure',
        ),
      },
      requestId: expect.any(String),
    });
    expect(db.select().from(mediaImages).get()).toMatchObject({
      id: result.imageId,
      processingStatus: 'failed',
    });
    expect(db.select().from(mediaJobs).get()).toMatchObject({
      imageId: result.imageId,
      status: 'failed',
      step: 'thumbnail',
    });
    expect(
      db
        .select()
        .from(mediaVersions)
        .all()
        .map((row) => row.kind)
        .sort(),
    ).toEqual(['compressed', 'original']);
    const original = await fixture.owner(`/i/${result.imageId}?type=original`);
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
  } finally {
    db.$client.exec('DROP TRIGGER fail_api_thumbnail');
  }
}, 30000);

it('a repeated POST creates a new image; its upload Token cannot manage Tokens, use Web uploads or read private content', async () => {
  const ids: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fixture.upload(
      key,
      fixture.form([['visibility', 'private']]),
    );
    expect(response.status, await response.clone().text()).toBe(201);
    ids.push((await response.json()).imageId);
  }
  expect(ids[0]).not.toBe(ids[1]);
  expect(fixture.connection.db.select().from(mediaImages).all()).toHaveLength(
    2,
  );
  expect(fixture.connection.db.select().from(mediaJobs).all()).toHaveLength(2);
  for (const [path, method, body] of [
    ['/api/upload-tokens', 'GET', undefined],
    ['/api/upload-tokens', 'POST', { name: 'denied' }],
    ['/api/uploads/submissions', 'POST', { requestId: 'denied', files: [] }],
    ['/api/settings/upload', 'GET', undefined],
  ] as const) {
    const response = await fixture.request(path, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        origin: fixture.origin,
        'content-type': 'application/json',
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  }
  for (const imageId of ids) {
    const response = await fixture.request(`/i/${imageId}?type=original`, {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(response.status).toBe(401);
  }
}, 30000);

it('returns only saved versions when compression is disabled and resolves the default link from current settings', async () => {
  fixture.connection.db
    .update(mediaSettings)
    .set({ compressionEnabled: false, defaultLinkVersion: 'original' })
    .run();
  const response = await fixture.upload(key);
  expect(response.status, await response.clone().text()).toBe(201);
  const result = await response.json();
  expect(result.actualVersion).toBe('original');
  expect(Object.keys(result.versions).sort()).toEqual([
    'original',
    'thumbnail',
  ]);
  expect(result.processing).toMatchObject({
    status: 'succeeded',
    warnings: expect.any(Array),
  });
  const original = fixture.connection.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.purpose, 'original'))
    .get()!;
  const storage = fixture.connection.db.select().from(storageConfigs).get()!;
  expect(
    await readFile(
      join(
        fixture.dataDir,
        'storage',
        storage.localPath!,
        `ariso/${storage.id}`,
        original.key,
      ),
    ),
  ).toEqual(fixture.bytes);
}, 30000);

it('a real curl multipart caller receives completed 201 and links to the exact uploaded bytes', async () => {
  const path = join(fixture.directory, 'curl-input.png');
  await writeFile(path, fixture.bytes);
  const { stdout, stderr } = await promisify(execFile)('curl', [
    '--silent',
    '--show-error',
    '--max-time',
    '30',
    '--request',
    'POST',
    '--header',
    `Authorization: Bearer ${key}`,
    '--form',
    'visibility=private',
    '--form',
    `file=@${path};type=application/octet-stream`,
    '--write-out',
    '\n%{http_code}',
    `${fixture.origin}/api/upload`,
  ]);
  expect(stderr).toBe('');
  const split = stdout.lastIndexOf('\n');
  expect(stdout.slice(split + 1)).toBe('201');
  const result = JSON.parse(stdout.slice(0, split));
  expect(result).toMatchObject({
    status: 'ready',
    processing: { status: 'succeeded' },
    imageId: expect.any(String),
  });
  expect(fixture.connection.db.select().from(mediaImages).get()).toMatchObject({
    id: result.imageId,
    originalName: 'curl-input.png',
    visibility: 'private',
    processingStatus: 'ready',
  });
  const original = await fixture.owner(`/i/${result.imageId}?type=original`);
  expect(original.status).toBe(200);
  expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
}, 30000);

it('a real proxy disconnect after acceptance loses the client response while the persisted processing job completes', async () => {
  const { db } = fixture.connection;
  // Hold the durable queue, so the actual proxy socket closes before processing starts.
  db.$client.exec(
    `CREATE TRIGGER hold_proxy_api_job AFTER INSERT ON media_jobs WHEN NEW.kind = 'process' BEGIN UPDATE media_jobs SET next_attempt_at = ${Date.now() + 60000} WHERE id = NEW.id; END`,
  );
  let downstream: ServerResponse | undefined;
  let applicationRequest: ClientRequest | undefined;
  const proxy = createServer((request, response) => {
    downstream = response;
    const upstream = httpRequest(`${fixture.origin}${request.url}`, {
      method: request.method,
      headers: { ...request.headers, host: new URL(fixture.origin).host },
    });
    applicationRequest = upstream;
    upstream.on('response', (result) => {
      response.writeHead(result.statusCode!, result.headers);
      result.pipe(response);
    });
    upstream.on('error', (error) => response.destroy(error));
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  expect(address && typeof address === 'object').toBe(true);
  const port = (address as { port: number }).port;
  const result = fetch(`http://127.0.0.1:${port}/api/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: fixture.form(),
    signal: AbortSignal.timeout(30000),
  }).then(
    (response) => ({ response, error: null }),
    (error: Error) => ({ response: null, error }),
  );
  try {
    await vi.waitFor(
      () => {
        expect(db.select().from(mediaImages).get()).toMatchObject({
          processingStatus: 'pending',
        });
        expect(db.select().from(mediaJobs).get()).toMatchObject({
          status: 'queued',
        });
        expect(downstream).toBeDefined();
      },
      { timeout: 10000 },
    );
    const imageId = db.select().from(mediaImages).get()!.id;
    const jobId = db.select().from(mediaJobs).get()!.id;
    const upstreamClosed = once(downstream!.socket!, 'close');
    const applicationClosed = new Promise<void>((resolve) =>
      applicationRequest!.once('close', resolve),
    );
    downstream!.destroy();
    await Promise.all([upstreamClosed, applicationClosed]);
    const disconnected = await result;
    expect(disconnected.response).toBeNull();
    expect(disconnected.error).toBeInstanceOf(TypeError);
    db.update(mediaJobs)
      .set({ nextAttemptAt: null })
      .where(eq(mediaJobs.id, jobId))
      .run();
    await vi.waitFor(
      () => {
        expect(
          db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get(),
        ).toMatchObject({ imageId, status: 'succeeded' });
        expect(
          db
            .select()
            .from(mediaImages)
            .where(eq(mediaImages.id, imageId))
            .get(),
        ).toMatchObject({ processingStatus: 'ready' });
      },
      { timeout: 10000 },
    );
    expect(db.select().from(mediaImages).all()).toHaveLength(1);
    expect(db.select().from(mediaJobs).all()).toHaveLength(1);
    const original = await fixture.request(`/i/${imageId}?type=original`);
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
  } finally {
    db.$client.exec('DROP TRIGGER hold_proxy_api_job');
    proxy.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      proxy.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30000);
