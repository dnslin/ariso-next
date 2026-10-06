import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

export type CreatedUploadToken = {
  token: { id: string; name: string; enabled: boolean };
  key: string;
};

/** Each HTTP fixture owns its process, database, storage and owner credentials. */
export async function publicUploadFixture(
  app = resolve('.next/standalone'),
  options: { clock?: boolean } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-public-upload-'));
  const dataDir = join(directory, 'data');
  const clockPath = join(directory, 'test-clock.mjs');
  if (options.clock) {
    await writeFile(
      clockPath,
      `const now = Date.now;
let offset = 0;
Date.now = () => now() + offset;
process.on('SIGUSR2', () => {
  offset += 900001;
});
`,
    );
  }
  const server = await launch(app, directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
    ...(options.clock && {
      NODE_OPTIONS: `--no-experimental-strip-types --import ${clockPath}`,
    }),
  });
  const origin = `http://127.0.0.1:${server.port}`;
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  let cookie = '';
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}${path}`, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(30000),
    });
  const owner = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    headers.set('origin', origin);
    return request(path, { ...init, headers });
  };
  const ownerJson = (path: string, method: string, body?: object) =>
    owner(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  async function close() {
    try {
      await stop(server.child, server.closed);
    } finally {
      connection?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
  try {
    const deadline = Date.now() + 15000;
    for (;;) {
      assert.equal(server.child.exitCode, null, server.logs());
      try {
        if ((await request('/api/health')).status === 200) break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
      }
      assert.ok(Date.now() < deadline, server.logs());
      await delay(30);
    }
    const setupEntry = server
      .logs()
      .split('\n')
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line);
          return entry.module === 'identity.setup' &&
            entry.event === 'setup-code'
            ? [entry]
            : [];
        } catch {
          return [];
        }
      });
    assert.equal(setupEntry.length, 1);
    const setup = await ownerJson('/api/setup', 'POST', {
      code: setupEntry[0].code,
      email,
      password,
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    });
    assert.equal(setup.status, 200, await setup.text());
    const login = await ownerJson('/api/auth/sign-in/email', 'POST', {
      email,
      password,
    });
    assert.equal(login.status, 200, await login.text());
    cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(cookie.includes('session_token='));
    connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
    const bytes = await readFile(
      resolve('tests/fixtures/runtime/images/sample.png'),
    );
    async function createToken(body: object = { name: 'Public HTTP fixture' }) {
      const response = await ownerJson('/api/upload-tokens', 'POST', body);
      assert.equal(response.status, 200, await response.clone().text());
      const result = (await response.json()) as CreatedUploadToken;
      assert.equal(typeof result.key, 'string');
      assert.equal(typeof result.token.id, 'string');
      return result;
    }
    const form = (fields: [string, string][] = [], fileBytes = bytes) => {
      const body = new FormData();
      for (const [name, value] of fields) body.append(name, value);
      body.append('file', new Blob([new Uint8Array(fileBytes)]), '旅行.fake');
      return body;
    };
    const upload = (key: string, body: BodyInit = form()) =>
      request('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body,
      });
    return {
      directory,
      dataDir,
      server,
      origin,
      connection,
      cookie,
      bytes,
      request,
      owner,
      ownerJson,
      createToken,
      form,
      upload,
      advanceClock() {
        assert.ok(options.clock, 'This fixture has no test clock');
        assert.ok(server.child.pid);
        process.kill(server.child.pid, 'SIGUSR2');
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Do not send any body bytes: authentication must finish before multipart reads. */
export function responseWithoutBody(
  origin: string,
  headers: Record<string, string>,
) {
  return new Promise<Response>((resolveResponse, reject) => {
    const request = httpRequest(
      `${origin}/api/upload`,
      {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=never-sent',
          'content-length': '1048576',
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          resolveResponse(
            new Response(new Uint8Array(Buffer.concat(chunks)), {
              status: response.statusCode,
              headers: Object.entries(response.headers).flatMap(
                ([name, value]) =>
                  value === undefined
                    ? []
                    : (Array.isArray(value) ? value : [value]).map(
                        (entry) => [name, entry] as [string, string],
                      ),
              ),
            }),
          );
          request.destroy();
        });
      },
    );
    request.on('error', reject);
    request.setTimeout(5000, () =>
      request.destroy(
        new Error('Upload read the body before rejecting its Token'),
      ),
    );
    request.flushHeaders();
  });
}
