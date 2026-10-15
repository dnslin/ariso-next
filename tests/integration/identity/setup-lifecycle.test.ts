import { execFileSync, spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/setup/route.ts';
import { startServer } from '../../../src/server/startup/server-start.ts';

const hashing = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock('better-auth/crypto', () => ({ hashPassword: hashing.hash }));

let directory: string;
let env: NodeJS.ProcessEnv;
let runtime: ReturnType<typeof startServer> | undefined;
const state = globalThis as typeof globalThis & {
  arisoServerRuntime?: ReturnType<typeof startServer>;
};
function child(mode: string) {
  return execFileSync(
    process.execPath,
    [resolve('tests/integration/identity/setup-lifecycle-helper.mjs'), mode],
    { env, encoding: 'utf8', timeout: 15000 },
  );
}
function request(code: string) {
  return new Request('http://localhost/api/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      email: 'owner@example.com',
      password: 'a-valid-password',
      publicUrl: 'http://localhost',
      timeZone: 'UTC',
    }),
  });
}
function initialize() {
  child('prestart');
  for (const key of ['DATA_DIR', 'BETTER_AUTH_SECRET', 'ARISO_ENCRYPTION_KEY'])
    vi.stubEnv(key, env[key]!);
  runtime = startServer();
  return runtime;
}
function expectEmpty() {
  for (const table of ['user', 'account', 'site_settings', 'media_settings'])
    expect(
      runtime!.connection.db.$client
        .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
        .get(),
    ).toEqual({ count: 0 });
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-setup-lifecycle-'));
  env = {
    ...process.env,
    // Keep child output focused on setup codes and failures, not normal shutdown info.
    LOG_LEVEL: 'error',
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  hashing.hash.mockReset();
});
afterEach(async () => {
  await runtime?.stop();
  runtime = undefined;
  delete state.arisoServerRuntime;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('setup process lifecycle', () => {
  it('imports without deployment secrets neither open a database nor issue a code', () => {
    expect(child('imports')).toBe('');
  });
  it('prestart prepares storage without issuing a code; real module reloads share one startup code', () => {
    expect(child('prestart')).not.toContain('setup-code');
    const first = child('reload')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const second = child('reload')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(first).toEqual([
      expect.objectContaining({
        module: 'identity.setup',
        event: 'setup-code',
        code: expect.any(String),
      }),
    ]);
    expect(second).toHaveLength(1);
    expect(second[0].code).not.toBe(first[0].code);
  });
});

describe('setup hash await boundary (controlled hash, real SQLite)', () => {
  it('rejects oversized streamed JSON before hashing and accepts a later ordinary setup', async () => {
    const current = initialize();
    hashing.hash.mockResolvedValue('controlled-hash');
    const validBody = await request(current.setup.code!).text();
    const chunks = [
      validBody.slice(0, -1),
      ',"padding":"',
      'x'.repeat(256 * 1024),
      '"}',
    ];
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (reads < chunks.length)
            controller.enqueue(new TextEncoder().encode(chunks[reads++]));
          else controller.close();
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const oversized = new Request('http://localhost/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '1' },
      body,
      duplex: 'half',
    } as RequestInit);
    const rejected = await POST(oversized);
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toEqual({
      code: 'INVALID_SETUP_INPUT',
      message: '请求内容超过 256 KiB',
    });
    expect(hashing.hash).not.toHaveBeenCalled();
    expect(cancelled).toBe(true);
    expect(reads).toBe(3);
    expect(body.locked).toBe(false);
    expectEmpty();
    expect((await POST(request(current.setup.code!))).status).toBe(200);
    expect(hashing.hash).toHaveBeenCalledOnce();
  });
  it('checks completed setup before consuming the request body', async () => {
    const current = initialize();
    hashing.hash.mockResolvedValue('controlled-hash');
    expect((await POST(request(current.setup.code!))).status).toBe(200);
    let reads = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(256 * 1024 + 1));
        },
      },
      { highWaterMark: 0 },
    );
    const response = await POST(
      new Request('http://localhost/api/setup', {
        method: 'POST',
        body,
        duplex: 'half',
      } as RequestInit),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'SETUP_ALREADY_COMPLETED',
    });
    expect(reads).toBe(0);
    expect(hashing.hash).toHaveBeenCalledOnce();
    await body.cancel();
  });
  it('preserves the setup malformed JSON error before hashing', async () => {
    initialize();
    const response = await POST(
      new Request('http://localhost/api/setup', {
        method: 'POST',
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'INVALID_SETUP_INPUT',
      message: '请提交完整的 JSON 初始化信息',
    });
    expect(hashing.hash).not.toHaveBeenCalled();
  });
  it('hashes outside the transaction and rechecks a code invalidated while awaiting', async () => {
    const current = initialize();
    const pendingHash = Promise.withResolvers<string>();
    hashing.hash.mockImplementation(() => {
      expect(current.connection.db.$client.inTransaction).toBe(false);
      return pendingHash.promise;
    });
    const response = POST(request(current.setup.code!));
    await vi.waitFor(() => expect(hashing.hash).toHaveBeenCalledOnce());
    current.setup.code = null;
    pendingHash.resolve('controlled-hash');
    expect(await (await response).json()).toMatchObject({
      code: 'INVALID_SETUP_CODE',
    });
    expect((await response).status).toBe(401);
    expectEmpty();
  });
  it('a hash failure leaves setup open and a later request can retry', async () => {
    const current = initialize();
    const code = current.setup.code!;
    hashing.hash.mockRejectedValueOnce(new Error('controlled hash failure'));
    const failed = await POST(request(code));
    expect(failed.status).toBe(500);
    expectEmpty();
    expect(current.setup.code).toBe(code);
    hashing.hash.mockResolvedValueOnce('controlled-retry-hash');
    expect((await POST(request(code))).status).toBe(200);
    expect(current.setup.code).toBeNull();
  });
  it('a second completed request prevents the awaiting request from creating another owner', async () => {
    const current = initialize();
    const pendingHash = Promise.withResolvers<string>();
    hashing.hash
      .mockImplementationOnce(() => pendingHash.promise)
      .mockResolvedValueOnce('controlled-winning-hash');
    const code = current.setup.code!;
    const first = POST(request(code));
    await vi.waitFor(() => expect(hashing.hash).toHaveBeenCalledOnce());
    const winner = await POST(request(code));
    expect(winner.status).toBe(200);
    pendingHash.resolve('controlled-losing-hash');
    const loser = await first;
    expect(loser.status).toBe(409);
    expect(await loser.json()).toMatchObject({
      code: 'SETUP_ALREADY_COMPLETED',
      redirectTo: '/login',
    });
    expect(
      current.connection.db.$client
        .prepare('SELECT password FROM account')
        .all(),
    ).toEqual([{ password: 'controlled-winning-hash' }]);
    expect(
      current.connection.db.$client
        .prepare('SELECT count(*) AS count FROM user')
        .get(),
    ).toEqual({ count: 1 });
  });
});

describe('setup real SIGKILL crash recovery', () => {
  it.each([
    'hash',
    'site_settings',
    'media_settings',
    'user',
    'account',
    'committed',
  ])(
    'recovers after process death at %s and can use real credential login',
    (point) => {
      child('prestart');
      const killed = spawnSync(
        process.execPath,
        [
          resolve('tests/integration/identity/setup-lifecycle-helper.mjs'),
          `crash-${point}`,
        ],
        { env, encoding: 'utf8', timeout: 15000 },
      );
      expect(killed.error).toBeUndefined();
      expect(killed.signal, killed.stderr).toBe('SIGKILL');
      if (point === 'hash')
        expect(killed.stderr).toContain(
          'real SCRYPTREQUEST observed; inTransaction=false',
        );
      const oldRecords = killed.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(oldRecords).toHaveLength(1);
      const db = new Database(join(env.DATA_DIR!, 'ariso.db'));
      try {
        for (const table of [
          'site_settings',
          'media_settings',
          'user',
          'account',
        ])
          expect(
            db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get(),
          ).toEqual({ count: point === 'committed' ? 1 : 0 });
        expect(
          db.prepare('SELECT COUNT(*) AS count FROM storage_settings').get(),
        ).toEqual({ count: 1 });
      } finally {
        db.close();
      }
      const recovered = child('recover').trim();
      if (point === 'committed') expect(recovered).toBe('');
      else {
        const records = recovered.split('\n').map((line) => JSON.parse(line));
        expect(records).toHaveLength(1);
        expect(records[0].code).not.toBe(oldRecords[0].code);
      }
    },
    30000,
  );
});
