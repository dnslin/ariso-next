import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readBuildIdentity } from '../../../src/server/runtime/build-info.ts';
import type {
  BackupJob,
  RestoreJob,
} from '../../../src/server/backup/types.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

export const backupTestOwner = {
  email: 'backup-owner@example.test',
  password: 'backup-production-owner-password',
};

export function requirePackagedBackupBuild(app = resolve('.next/standalone')) {
  const identity = readBuildIdentity(join(app, 'dist', 'build-info.json'));
  assert.ok(
    identity,
    'Backup HTTP integration requires a standalone build with an explicit version and revision',
  );
  assert.ok(
    existsSync(join(app, 'dist', 'cli', 'backup-worker.js')),
    'The packaged backup worker is missing',
  );
  return identity;
}

/** Error labels deliberately exclude request headers, token values and complete auth responses. */
export async function expectHttp(
  response: Response,
  expected: number,
  label: string,
) {
  if (response.status !== expected) {
    let code = '';
    try {
      const value = await response.json();
      const candidate = value?.code ?? value?.error?.code;
      if (typeof candidate === 'string' && /^[A-Z_0-9]+$/.test(candidate))
        code = candidate;
    } catch {
      /* Status and the stage label remain sufficient for non-JSON failures. */
    }
    throw new Error(
      `${label}: expected HTTP ${expected}, received ${response.status}${code ? ` (${code})` : ''}`,
    );
  }
  return response;
}

export async function httpJson<T>(
  response: Response,
  expected: number,
  label: string,
): Promise<T> {
  await expectHttp(response, expected, label);
  return response.json() as Promise<T>;
}

export async function waitUntil<T>(
  read: () => T | Promise<T>,
  accepted: (value: T) => boolean,
  label: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (accepted(value)) return value;
    if (Date.now() >= deadline) throw new Error(`${label}: timed out`);
    await delay(50);
  }
}

/** Owns one temporary instance; restart retains both its port and deployment keys. */
export async function startBackupProductionInstance(
  options: {
    app?: string;
    directory?: string;
    port?: number;
    authSecret?: string;
    encryptionKey?: string;
  } = {},
) {
  const app = options.app ?? resolve('.next/standalone');
  const application = requirePackagedBackupBuild(app);
  const directory =
    options.directory ?? (await mkdtemp(join(tmpdir(), 'ariso-backup-http-')));
  await mkdir(directory, { recursive: true });
  const dataDir = join(directory, 'data');
  const env = {
    // CI may run with a UID absent from passwd; SDK config still needs an isolated home.
    HOME: directory,
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PATH: `${dirname(process.execPath)}:/opt/homebrew/bin:${process.env.PATH ?? '/usr/bin:/bin'}`,
    LOG_LEVEL: 'warn',
    BETTER_AUTH_SECRET: options.authSecret ?? randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY:
      options.encryptionKey ?? randomBytes(32).toString('hex'),
  };
  let server = await launch(app, directory, {
    ...env,
    ...(options.port === undefined ? {} : { PORT: String(options.port) }),
  });
  let stopped = false;
  let shutdownPromise: Promise<void> | undefined;
  let cookie = '';
  const origin = `http://127.0.0.1:${server.port}`;
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}${path}`, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  function setupCode() {
    const entries = server
      .logs()
      .split('\n')
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line);
          return entry.module === 'identity.setup' &&
            entry.event === 'setup-code' &&
            typeof entry.code === 'string'
            ? [entry.code as string]
            : [];
        } catch {
          return [];
        }
      });
    return entries.at(-1);
  }
  function diagnostics() {
    return server
      .logs()
      .split('\n')
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line);
          if (
            !['error', 'fatal', 50, 60].includes(entry.level) ||
            entry.module === 'identity.setup'
          )
            return [];
          return [
            {
              module:
                typeof entry.module === 'string' ? entry.module : 'runtime',
              message:
                typeof entry.msg === 'string' ? entry.msg : 'runtime failure',
              code:
                typeof entry.err?.code === 'string' &&
                /^[A-Z_0-9]+$/.test(entry.err.code)
                  ? entry.err.code
                  : undefined,
            },
          ];
        } catch {
          return [];
        }
      })
      .slice(-5);
  }
  async function healthy() {
    await waitUntil(
      async () => {
        if (server.child.exitCode !== null)
          throw new Error(
            `Standalone exited during startup with code ${server.child.exitCode}; ${JSON.stringify(diagnostics())}`,
          );
        try {
          const response = await request('/api/health', {
            signal: AbortSignal.timeout(1000),
          });
          await response.arrayBuffer();
          return response.status === 200;
        } catch {
          return false;
        }
      },
      Boolean,
      'Standalone startup',
      20_000,
    );
  }
  function owner(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    headers.set('origin', origin);
    return request(path, { ...init, headers });
  }
  const ownerJson = (path: string, method: string, body?: object) =>
    owner(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  function restore(path: string, init: RequestInit = {}, code = setupCode()) {
    assert.ok(code, 'This instance has no current initialization code');
    const headers = new Headers(init.headers);
    headers.set('X-Ariso-Setup-Code', code);
    return request(path, { ...init, headers });
  }
  const restoreJson = (
    path: string,
    method: string,
    body?: object,
    code?: string,
  ) =>
    restore(
      path,
      {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      code,
    );
  async function shutdown() {
    if (stopped) return shutdownPromise;
    stopped = true;
    shutdownPromise = stop(server.child, server.closed);
    await shutdownPromise;
  }
  try {
    await healthy();
  } catch (error) {
    await shutdown();
    const details = JSON.stringify(diagnostics());
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Standalone fixture startup failed; ${details}`, {
      cause: error,
    });
  }
  return {
    directory,
    dataDir,
    origin,
    application,
    request,
    owner,
    ownerJson,
    restore,
    restoreJson,
    setupCode,
    diagnostics,
    ownerCookie: () => cookie,
    async initialize(credentials = backupTestOwner) {
      const code = setupCode();
      assert.ok(code, 'Initialization code must be available before setup');
      await expectHttp(
        await request('/api/setup', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({
            code,
            ...credentials,
            publicUrl: origin,
            timeZone: 'Asia/Shanghai',
            name: '本地恢复验证',
          }),
        }),
        200,
        'Source initialization',
      );
    },
    async login(credentials = backupTestOwner) {
      const response = await expectHttp(
        await request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify(credentials),
        }),
        200,
        'Owner password login',
      );
      cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      assert.ok(
        cookie.includes('session_token='),
        'A real owner session Cookie is required',
      );
      await response.arrayBuffer();
    },
    async restart() {
      await shutdown();
      server = await launch(app, directory, {
        ...env,
        PORT: String(server.port),
      });
      stopped = false;
      shutdownPromise = undefined;
      cookie = '';
      await healthy();
    },
    stop: shutdown,
    async removeData() {
      await shutdown();
      await rm(dataDir, { recursive: true, force: true });
    },
    async close() {
      await shutdown();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
export type BackupProductionInstance = Awaited<
  ReturnType<typeof startBackupProductionInstance>
>;

export async function waitForBackupJob(
  instance: BackupProductionInstance,
  id: string,
) {
  return waitUntil(
    async () => {
      const { job } = await httpJson<{ job: BackupJob }>(
        await instance.owner(`/api/backups/${id}`),
        200,
        'Read backup progress',
      );
      if (['failed', 'interrupted', 'cancelled'].includes(job.status))
        throw new Error(
          `Backup reached ${job.status}: ${job.failure?.code ?? 'no diagnostic code'}`,
        );
      return job;
    },
    (job) => job.status === 'ready',
    'Backup completion',
    90_000,
  );
}
export async function waitForRestoreJob(
  instance: BackupProductionInstance,
  id: string,
  status: RestoreJob['status'],
) {
  return waitUntil(
    async () => {
      const { job } = await httpJson<{ job: RestoreJob }>(
        await instance.restore(`/api/setup/restore/${id}`),
        200,
        'Read restore progress',
      );
      if (
        job.status !== status &&
        ['failed', 'interrupted', 'cancelled'].includes(job.status)
      )
        throw new Error(
          `Restore reached ${job.status}: ${job.failure?.code ?? 'no diagnostic code'}`,
        );
      return job;
    },
    (job) => job.status === status,
    `Restore ${status}`,
    90_000,
  );
}

async function incomingResponse(response: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.from(chunk));
  return new Response(new Uint8Array(Buffer.concat(chunks)), {
    status: response.statusCode ?? 500,
    headers: Object.entries(response.headers).flatMap(([name, value]) =>
      value === undefined
        ? []
        : (Array.isArray(value) ? value : [value]).map(
            (entry) => [name, entry] as [string, string],
          ),
    ),
  });
}

/** A real admitted multipart request held before the file bytes make the pause window deterministic. */
export function heldPublicUpload(
  instance: BackupProductionInstance,
  key: string,
  bytes: Buffer,
  fields: [string, string][],
) {
  const boundary = `ariso-backup-${randomBytes(16).toString('hex')}`;
  const prefix = Buffer.from(
    fields
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      )
      .join('') +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="held.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  let released = false;
  let settled = false;
  const pending = httpRequest(`${instance.origin}/api/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': prefix.length + bytes.length + suffix.length,
    },
  });
  const response = new Promise<Response>((resolveResponse, reject) => {
    pending.once('response', (incoming) => {
      void incomingResponse(incoming).then(resolveResponse, reject);
    });
    pending.once('error', reject);
  });
  void response.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  pending.write(prefix);
  return {
    response,
    get settled() {
      return settled;
    },
    release() {
      if (!released) {
        released = true;
        pending.end(Buffer.concat([bytes, suffix]));
      }
    },
    abort() {
      pending.destroy();
    },
  };
}

/** Sends headers but never the announced body, so authorization must produce the response first. */
export function restoreResponseWithoutBody(
  instance: BackupProductionInstance,
  id: string,
) {
  return new Promise<Response>((resolveResponse, reject) => {
    const pending = httpRequest(
      `${instance.origin}/api/setup/restore/${id}/file`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': 8 * 1024 * 1024,
          'Upload-Offset': '0',
          'Upload-Length': 8 * 1024 * 1024,
          'X-Ariso-Setup-Code': 'invalid-current-code',
        },
      },
      (incoming) => {
        void incomingResponse(incoming).then((response) => {
          resolveResponse(response);
          pending.destroy();
        }, reject);
      },
    );
    pending.once('error', reject);
    pending.setTimeout(5000, () =>
      pending.destroy(
        new Error('Restore authorization waited for the upload body'),
      ),
    );
    pending.flushHeaders();
  });
}
