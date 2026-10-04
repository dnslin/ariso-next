import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>>;
let connection: ReturnType<typeof openRuntimeDatabase>;
let origin: string;
let cookie: string;
let env: Record<string, string>;
function request(
  path: string,
  method = 'GET',
  body?: unknown,
  headers = { cookie, origin },
) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-storage-http-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  server = await launch(resolve('.next/standalone'), directory, env);
  origin = `http://127.0.0.1:${server.port}`;
  await vi.waitFor(
    async () => {
      if (server.child.exitCode !== null) throw new Error(server.logs());
      expect((await fetch(`${origin}/api/health`)).status).toBe(200);
    },
    { timeout: 15000 },
  );
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
  await seedAuthOwner(connection, origin);
  const login = await request(
    '/api/auth/sign-in/email',
    'POST',
    { email, password },
    { cookie: '', origin },
  );
  expect(login.status).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}, 30000);
afterAll(async () => {
  if (server) await stop(server.child, server.closed);
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('管理路由拒绝匿名、上传 Token 与跨来源写入', async () => {
  for (const [path, method] of [
    ['/api/storages', 'GET'],
    ['/api/storages', 'POST'],
    ['/api/storages/missing', 'GET'],
    ['/api/storages/missing', 'PATCH'],
    ['/api/storages/missing/test', 'POST'],
    ['/api/storages/missing/cors-tests', 'GET'],
    ['/api/storages/missing/cors-tests', 'POST'],
    ['/api/storages/missing/cors-tests/missing/complete', 'POST'],
    ['/api/storages/missing/probes/missing/retry-cleanup', 'POST'],
    ['/api/settings/storage', 'GET'],
    ['/api/settings/storage', 'PATCH'],
  ]) {
    const response = await request(
      path,
      method,
      method === 'GET' ? undefined : {},
      { cookie: '', origin },
    );
    expect(response.status, `${method} ${path}`).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bearer = await fetch(`${origin}${path}`, {
      method,
      headers: { authorization: 'Bearer upload-token', origin },
    });
    expect(bearer.status).toBe(401);
  }
  expect(
    (
      await request(
        '/api/storages',
        'POST',
        {},
        { cookie, origin: 'https://other.example' },
      )
    ).status,
  ).toBe(403);
});

it('真实 HTTP 创建查询、默认读写与秘密更新均不回显秘密，无引用允许位置修改和删除', async () => {
  const create = await request('/api/storages', 'POST', {
    type: 'local',
    name: 'HTTP 本地',
    localPath: 'http-local',
  });
  expect(create.status, await create.clone().text()).toBe(201);
  const local = await create.json();
  const set = await request('/api/settings/storage', 'PATCH', {
    defaultStorageId: local.id,
  });
  expect(set.status).toBe(200);
  expect(await (await request('/api/settings/storage')).json()).toMatchObject({
    defaultStorageId: local.id,
  });
  expect((await request('/api/storages/missing')).status).toBe(404);
  const invalid = await request('/api/storages', 'POST', {
    type: 'local',
    name: 'bad',
    localPath: 'ok',
    bucket: 'foreign',
  });
  expect(invalid.status).toBe(400);
  const s3Response = await request('/api/storages', 'POST', {
    type: 's3',
    name: 'HTTP S3',
    endpoint: 'https://objects.example.test',
    region: 'auto',
    bucket: 'test-bucket',
    pathPrefix: '/photos/',
    forcePathStyle: true,
    accessKey: 'http-access-fixture',
    secretKey: 'http-secret-fixture',
  });
  expect(s3Response.status, await s3Response.clone().text()).toBe(201);
  const s3 = await s3Response.json();
  expect(s3).toMatchObject({
    enabled: false,
    hasAccessKey: true,
    hasSecretKey: true,
  });
  const listing = await (await request('/api/storages')).text();
  expect(listing).toContain(s3.id);
  expect(listing).not.toContain('http-access-fixture');
  expect(listing).not.toContain('http-secret-fixture');
  expect(
    (
      await request('/api/settings/storage', 'PATCH', {
        defaultStorageId: s3.id,
      })
    ).status,
  ).toBe(409);
  expect(
    (await request(`/api/storages/${s3.id}`, 'PATCH', { enabled: true }))
      .status,
  ).toBe(409);
  const renamed = await request(`/api/storages/${s3.id}`, 'PATCH', {
    name: '重命名',
  });
  expect(renamed.status).toBe(200);
  expect((await renamed.json()).configRevision).toBe(s3.configRevision);
  const replaced = await request(`/api/storages/${s3.id}`, 'PATCH', {
    secretKey: 'replacement-fixture',
  });
  expect(replaced.status).toBe(200);
  expect(await replaced.json()).toMatchObject({
    enabled: false,
    configRevision: s3.configRevision + 1,
  });
  expect(
    (
      await request(`/api/storages/${local.id}`, 'PATCH', {
        localPath: 'changed',
      })
    ).status,
  ).toBe(200);
  const deleted = await request(`/api/storages/${local.id}`, 'DELETE');
  expect(deleted.status, await deleted.clone().text()).toBe(200);
  expect(await deleted.json()).toMatchObject({
    deleted: true,
    storageId: local.id,
  });
  expect(await (await request('/api/settings/storage')).json()).toMatchObject({
    defaultStorageId: null,
  });
  expect(
    (
      await request('/api/settings/storage', 'PATCH', {
        defaultStorageId: null,
      })
    ).status,
  ).toBe(200);
  expect(await (await request('/api/settings/storage')).json()).toMatchObject({
    defaultStorageId: null,
  });
  expect(
    (await request(`/api/storages/${s3.id}`, 'PATCH', { secretKey: null }))
      .status,
  ).toBe(200);
  const read = await (await request(`/api/storages/${s3.id}`)).json();
  expect(read).toMatchObject({ hasAccessKey: true, hasSecretKey: false });
  expect(read).not.toHaveProperty('accessKey');
  expect(read).not.toHaveProperty('secretKey');
  expect(read).not.toHaveProperty('accessKeyEncrypted');
  expect(read).not.toHaveProperty('secretKeyEncrypted');
});

it('显式或默认 S3 创建排队会话，接收字节前不创建图片或处理任务', async () => {
  const response = await request('/api/storages', 'POST', {
    type: 's3',
    name: 'S3 上传目标',
    endpoint: 'https://objects.example.test',
    region: 'auto',
    bucket: 'upload-boundary',
    accessKey: 'fixture-access',
    secretKey: 'fixture-secret',
  });
  expect(response.status).toBe(201);
  const storage = await response.json();
  // T-STO-04 owns real probes; this historical result only exercises the caller boundary.
  connection.db.$client
    .prepare(
      "UPDATE storage_configs SET enabled=1, connection_status='passed', connection_revision=config_revision WHERE id=?",
    )
    .run(storage.id);
  expect(
    (
      await request('/api/settings/storage', 'PATCH', {
        defaultStorageId: storage.id,
      })
    ).status,
  ).toBe(200);
  const submissions = connection.db.$client
    .prepare('SELECT * FROM upload_submissions')
    .all();
  const sessions = connection.db.$client
    .prepare('SELECT * FROM upload_sessions')
    .all();
  const images = connection.db.$client
    .prepare('SELECT * FROM media_images')
    .all();
  const jobs = connection.db.$client.prepare('SELECT * FROM media_jobs').all();
  try {
    const created: string[] = [];
    for (const explicit of [true, false]) {
      const queued = await request('/api/uploads/submissions', 'POST', {
        requestId: randomUUID(),
        files: [
          {
            queueItemId: randomUUID(),
            originalName: 'boundary.png',
            declaredSize: 32,
          },
        ],
        ...(explicit ? { storageId: storage.id } : {}),
      });
      expect(queued.status, await queued.clone().text()).toBe(201);
      const result = await queued.json();
      expect(result).toMatchObject({
        storageId: storage.id,
        sessions: [
          { state: 'queued', route: null, imageId: null, jobId: null },
        ],
      });
      created.push(result.id);
      expect(
        connection.db.$client.prepare('SELECT * FROM upload_submissions').all(),
      ).toHaveLength(submissions.length + created.length);
      expect(
        connection.db.$client.prepare('SELECT * FROM upload_sessions').all(),
      ).toHaveLength(sessions.length + created.length);
      const recovered = await request(`/api/uploads/submissions/${result.id}`);
      expect(recovered.status).toBe(200);
      expect(await recovered.json()).toEqual(result);
      expect(
        connection.db.$client.prepare('SELECT * FROM media_images').all(),
      ).toEqual(images);
      expect(
        connection.db.$client.prepare('SELECT * FROM media_jobs').all(),
      ).toEqual(jobs);
    }
    const blocked = await request(`/api/storages/${storage.id}`, 'PATCH', {
      bucket: 'other-bucket',
    });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: 'STORAGE_IN_USE' });
    const unchangedPosition = await request(
      `/api/storages/${storage.id}`,
      'PATCH',
      { endpoint: 'https://OBJECTS.example.test:443/', pathPrefix: '/' },
    );
    expect(
      unchangedPosition.status,
      await unchangedPosition.clone().text(),
    ).toBe(200);
    expect(await unchangedPosition.json()).toMatchObject({
      configRevision: storage.configRevision,
    });
    const credential = await request(`/api/storages/${storage.id}`, 'PATCH', {
      name: '有会话仍可改名和凭据',
      secretKey: 'replacement-with-active-reference',
    });
    expect(credential.status).toBe(200);
    expect(await credential.json()).toMatchObject({
      enabled: false,
      configRevision: storage.configRevision + 1,
    });
  } finally {
    expect(
      (
        await request('/api/settings/storage', 'PATCH', {
          defaultStorageId: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/storages/${storage.id}`, 'PATCH', {
          enabled: false,
        })
      ).status,
    ).toBe(200);
  }
});

it('输入和持久化错误保留诊断但不回显凭据，失败后可重试', async () => {
  const input = {
    type: 's3',
    name: '故障配置',
    endpoint: 'https://objects.example.test',
    region: 'auto',
    bucket: 'fault-bucket',
    accessKey: 'failure-access-fixture',
    secretKey: 'failure-secret-fixture',
  };
  const invalid = await request('/api/storages', 'POST', {
    ...input,
    secretKey: '********',
  });
  expect(invalid.status).toBe(400);
  expect(await invalid.text()).not.toContain(input.accessKey);
  const local = await (
    await request('/api/storages', 'POST', {
      type: 'local',
      name: 'local-secret-check',
      localPath: 'secret-check',
    })
  ).json();
  expect(
    (
      await request(`/api/storages/${local.id}`, 'PATCH', {
        secretKey: 'not-local',
      })
    ).status,
  ).toBe(400);
  const logOffset = server.logs().length;
  connection.db.$client.exec(
    "CREATE TRIGGER storage_write_fault BEFORE INSERT ON storage_configs BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END",
  );
  try {
    const failed = await request('/api/storages', 'POST', input);
    expect(failed.status).toBe(500);
    const response = await failed.text();
    await vi.waitFor(() =>
      expect(server.logs().slice(logOffset)).toContain(
        'injected storage failure',
      ),
    );
    for (const secret of [input.accessKey, input.secretKey]) {
      expect(response).not.toContain(secret);
      expect(server.logs().slice(logOffset)).not.toContain(secret);
    }
  } finally {
    connection.db.$client.exec('DROP TRIGGER storage_write_fault');
  }
  expect((await request('/api/storages', 'POST', input)).status).toBe(201);
});

it('探测 HTTP 拒绝伪造通过、过期 revision、错误存储类型与跨来源重试', async () => {
  const localResponse = await request('/api/storages', 'POST', {
    type: 'local',
    name: 'probe local',
    localPath: 'probe-local',
  });
  const local = await localResponse.json();
  expect(
    (await request(`/api/storages/${local.id}/test`, 'POST', { revision: 1 }))
      .status,
  ).toBe(400);
  expect(
    (
      await request('/api/storages/missing/test', 'POST', {
        revision: 1,
        passed: true,
      })
    ).status,
  ).toBe(400);
  expect(
    (await request('/api/storages/missing/test', 'POST', { revision: 1 }))
      .status,
  ).toBe(404);
  expect(
    (
      await request(
        '/api/storages/missing/probes/missing/retry-cleanup',
        'POST',
        {},
        { cookie, origin: 'https://other.example' },
      )
    ).status,
  ).toBe(403);
  const created = await request('/api/storages', 'POST', {
    type: 's3',
    name: 'stale probe',
    endpoint: 'http://127.0.0.1:1',
    region: 'auto',
    bucket: 'test',
    forcePathStyle: true,
    accessKey: 'key',
    secretKey: 'secret',
  });
  const storage = await created.json();
  expect(
    (await request(`/api/storages/${storage.id}/test`, 'POST', { revision: 2 }))
      .status,
  ).toBe(409);
  const failed = await request(`/api/storages/${storage.id}/test`, 'POST', {
    revision: 1,
  });
  expect(failed.status).toBe(200);
  const report = await failed.json();
  expect(report).toMatchObject({ passed: false, cleanupPending: false });
  expect(report.stages[0].status).toBe('failed');
  expect(report.stages[4]).toMatchObject({
    stage: 'delete',
    status: 'skipped',
  });
  const detail = await (await request(`/api/storages/${storage.id}`)).json();
  expect(detail.connectionStatus).toBe('failed');
  expect(detail.probes).toEqual([]);
  const retry = await request(
    `/api/storages/${storage.id}/probes/${report.probeId}/retry-cleanup`,
    'POST',
  );
  expect(retry.status).toBe(404);
  expect(await retry.json()).toMatchObject({
    code: 'STORAGE_NOT_FOUND',
  });
  expect(JSON.stringify(detail)).not.toContain('secretKeyEncrypted');
});

it('真实 HTTP 保留已写入对象的清理责任，删除拒绝时重试返回 502', async () => {
  const objects = new Map<string, Buffer>();
  const deletedKeys: string[] = [];
  const endpoint = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const error = (status: number, code: string) => {
      res.writeHead(status, {
        'content-type': 'application/xml',
        'x-amz-request-id': 'http-cleanup-request',
      });
      res.end(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`);
    };
    if (url.searchParams.has('versioning'))
      return res.end('<VersioningConfiguration/>');
    if (url.searchParams.has('object-lock'))
      return error(404, 'ObjectLockConfigurationNotFoundError');
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(url.pathname, Buffer.concat(chunks));
      res.end();
      return;
    }
    if (req.method === 'DELETE') {
      deletedKeys.push(url.pathname);
      return error(403, 'AccessDenied');
    }
    if (!req.headers.authorization) return error(403, 'AccessDenied');
    const bytes = objects.get(url.pathname);
    if (!bytes) return error(404, 'NoSuchKey');
    res.setHeader('content-length', bytes.length);
    res.end(bytes);
  });
  endpoint.listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  try {
    const address = endpoint.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address');
    const created = await request('/api/storages', 'POST', {
      type: 's3',
      name: 'HTTP cleanup',
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'test',
      forcePathStyle: true,
      accessKey: 'cleanup-access-fixture',
      secretKey: 'cleanup-secret-fixture',
    });
    expect(created.status).toBe(201);
    const storage = await created.json();
    const tested = await request(`/api/storages/${storage.id}/test`, 'POST', {
      revision: 1,
    });
    expect(tested.status).toBe(200);
    const report = await tested.json();
    expect(report).toMatchObject({ passed: false, cleanupPending: true });
    expect(
      report.stages.map((stage: { status: string }) => stage.status),
    ).toEqual(['passed', 'passed', 'passed', 'passed', 'failed']);
    const key = `/test/ariso/${storage.id}/probes/${report.probeId}`;
    expect(objects.size).toBe(1);
    expect(objects.get(key)?.length).toBe(64);
    const detail = await (await request(`/api/storages/${storage.id}`)).json();
    expect(detail.connectionStatus).toBe('failed');
    expect(detail.probes).toHaveLength(1);
    expect(detail.probes[0]).toMatchObject({
      id: report.probeId,
      state: 'cleanup',
      objectState: 'stored',
      byteSize: 64,
    });
    const retry = await request(
      `/api/storages/${storage.id}/probes/${report.probeId}/retry-cleanup`,
      'POST',
    );
    expect(retry.status).toBe(502);
    expect(await retry.json()).toMatchObject({
      code: 'STORAGE_OPERATION_FAILED',
      serviceCode: 'AccessDenied',
      requestId: 'http-cleanup-request',
    });
    expect(deletedKeys).toEqual([key, key]);
    expect(objects.get(key)?.length).toBe(64);
    const after = await (await request(`/api/storages/${storage.id}`)).json();
    expect(after.probes).toHaveLength(1);
    expect(after.probes[0].id).toBe(report.probeId);
    expect(JSON.stringify(after)).not.toContain('secretKeyEncrypted');
  } finally {
    endpoint.closeAllConnections();
    await new Promise<void>((resolve) => endpoint.close(() => resolve()));
  }
});

it('停用 S3 的密文也在独立 prestart 校验；错误密钥失败且原配置不变', async () => {
  const created = await request('/api/storages', 'POST', {
    type: 's3',
    name: '预检',
    endpoint: 'https://no-network.example.test',
    region: 'auto',
    bucket: 'preflight-bucket',
    pathPrefix: '',
    forcePathStyle: false,
    accessKey: 'preflight-access',
    secretKey: 'preflight-secret',
  });
  expect(created.status).toBe(201);
  await stop(server.child, server.closed);
  const before = connection.db.$client
    .prepare('SELECT * FROM storage_configs ORDER BY id')
    .all();
  const run = (key: string) =>
    spawnSync(process.execPath, ['dist/cli/prestart.js'], {
      cwd: process.cwd(),
      env: { ...process.env, ...env, ARISO_ENCRYPTION_KEY: key },
      encoding: 'utf8',
      timeout: 10000,
    });
  const wrong = run(randomBytes(32).toString('hex'));
  expect(wrong.status).toBe(1);
  expect(wrong.stdout + wrong.stderr).toContain('密文认证失败');
  for (const secret of ['preflight-access', 'preflight-secret'])
    expect(wrong.stdout + wrong.stderr).not.toContain(secret);
  expect(
    connection.db.$client
      .prepare('SELECT * FROM storage_configs ORDER BY id')
      .all(),
  ).toEqual(before);
  const correct = run(env.ARISO_ENCRYPTION_KEY);
  expect(correct.status, correct.stdout + correct.stderr).toBe(0);
  expect(
    connection.db.$client
      .prepare('SELECT * FROM storage_configs ORDER BY id')
      .all(),
  ).toEqual(before);
  expect(
    connection.db.$client
      .prepare('SELECT default_storage_id FROM storage_settings')
      .get(),
  ).toEqual({ default_storage_id: null });
});
