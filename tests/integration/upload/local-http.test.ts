import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mediaImages, mediaJobs } from '../../../src/server/media/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>> | undefined;
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
let origin: string;
let cookie: string;
let token: string;
let bytes: Buffer;

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
function post(
  path: string,
  body: object,
  headers: Record<string, string> = { cookie, origin },
) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function submissionInput() {
  return {
    requestId: randomUUID(),
    files: [
      {
        queueItemId: randomUUID(),
        originalName: '旅行.png',
        declaredSize: bytes.length,
        declaredMime: 'image/png',
      },
    ],
    visibility: 'private',
  };
}
async function createSubmission() {
  const input = submissionInput();
  const response = await post('/api/uploads/submissions', input);
  expect(response.status, await response.clone().text()).toBe(201);
  const submission = await response.json();
  expect(submission.sessions).toHaveLength(1);
  return { ...submission, input } as {
    id: string;
    sessions: { id: string }[];
    input: ReturnType<typeof submissionInput>;
  };
}
function content(
  id: string,
  headers: Record<string, string> = { cookie, origin },
) {
  const body = new FormData();
  body.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    '旅行.png',
  );
  return request(`/api/uploads/sessions/${id}/content`, {
    method: 'POST',
    headers,
    body,
  });
}
function cancel(
  id: string,
  headers: Record<string, string> = { cookie, origin },
) {
  return request(`/api/uploads/sessions/${id}`, { method: 'DELETE', headers });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-upload-http-'));
  const dataDir = join(directory, 'data');
  server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
  });
  origin = `http://127.0.0.1:${server.port}`;
  await vi.waitFor(
    async () => {
      expect(server!.child.exitCode, server!.logs()).toBeNull();
      expect((await request('/api/health')).status).toBe(200);
    },
    { timeout: 15000 },
  );
  const setupEntry = server
    .logs()
    .split('\n')
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.module === 'identity.setup' && entry.event === 'setup-code'
          ? [entry]
          : [];
      } catch {
        return [];
      }
    });
  expect(setupEntry).toHaveLength(1);
  const setup = await post(
    '/api/setup',
    {
      code: setupEntry[0].code,
      email,
      password,
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    },
    { origin, cookie: '' },
  );
  expect(setup.status, await setup.clone().text()).toBe(200);
  const login = await post(
    '/api/auth/sign-in/email',
    { email, password },
    { origin, cookie: '' },
  );
  expect(login.status, await login.clone().text()).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  token = (await login.json()).token;
  connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
  bytes = await readFile(resolve('tests/fixtures/runtime/images/sample.png'));
}, 30000);
afterEach(async () => {
  try {
    if (server) await stop(server.child, server.closed);
  } finally {
    server = undefined;
    connection?.close();
    connection = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it('requires the owner Cookie on every endpoint and checks mutation origins before accepting bytes', async () => {
  const submission = await createSubmission();
  const id = submission.sessions[0].id;
  for (const headers of [{}, { authorization: `Bearer ${token}` }] as Record<
    string,
    string
  >[]) {
    expect(
      (await post('/api/uploads/submissions', submissionInput(), headers))
        .status,
    ).toBe(401);
    expect(
      (await request(`/api/uploads/submissions/${submission.id}`, { headers }))
        .status,
    ).toBe(401);
    expect((await content(id, headers)).status).toBe(401);
    expect((await cancel(id, headers)).status).toBe(401);
  }
  for (const headers of [
    { cookie },
    { cookie, origin: 'https://other.example' },
  ] as Record<string, string>[]) {
    expect(
      (await post('/api/uploads/submissions', submissionInput(), headers))
        .status,
    ).toBe(403);
    expect((await content(id, headers)).status).toBe(403);
    expect((await cancel(id, headers)).status).toBe(403);
  }
  expect(connection!.db.select().from(mediaImages).all()).toHaveLength(0);
});

it('accepts exact PNG bytes once and recovers an unread acceptance response by querying the submission', async () => {
  const submission = await createSubmission();
  const id = submission.sessions[0].id;
  const accepted = await content(id);
  expect(accepted.status, await accepted.clone().text()).toBe(202);
  // Discard the response payload: the caller must recover identifiers through GET.
  await accepted.body!.cancel();
  const query = await request(`/api/uploads/submissions/${submission.id}`, {
    headers: { cookie },
  });
  expect(query.status).toBe(200);
  const recovered = await query.json();
  expect(recovered.id).toBe(submission.id);
  expect(recovered.sessions).toHaveLength(1);
  const saved = recovered.sessions[0];
  expect(saved).toMatchObject({
    id,
    state: 'accepted',
    imageId: expect.any(String),
    jobId: expect.any(String),
  });
  const original = await request(`/i/${saved.imageId}?type=original`, {
    headers: { cookie },
  });
  expect(original.status, await original.clone().text()).toBe(200);
  expect(original.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
  const retry = await content(id);
  expect(retry.status, await retry.clone().text()).toBe(409);
  expect(await retry.json()).toMatchObject({ imageId: saved.imageId });
  const afterRetry = await request(
    `/api/uploads/submissions/${submission.id}`,
    { headers: { cookie } },
  );
  expect(afterRetry.status).toBe(200);
  expect((await afterRetry.json()).sessions).toMatchObject([
    { id, state: 'accepted', imageId: saved.imageId, jobId: saved.jobId },
  ]);
  expect(connection!.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(connection!.db.select().from(mediaJobs).all()).toHaveLength(1);
  const tooLate = await cancel(id);
  expect(tooLate.status).toBe(409);
  expect(await tooLate.json()).toMatchObject({ imageId: saved.imageId });
  expect(connection!.db.select().from(mediaImages).all()).toHaveLength(1);
});

it('cancels before acceptance and rejects later content without creating media', async () => {
  const submission = await createSubmission();
  const id = submission.sessions[0].id;
  const canceled = await cancel(id);
  expect(canceled.status, await canceled.clone().text()).toBe(200);
  expect(await canceled.json()).toMatchObject({ id, state: 'cancelled' });
  const lateContent = await content(id);
  expect(lateContent.status).toBe(409);
  const query = await request(`/api/uploads/submissions/${submission.id}`, {
    headers: { cookie },
  });
  expect(query.status).toBe(200);
  expect((await query.json()).sessions).toMatchObject([
    { id, state: 'cancelled', imageId: null, jobId: null },
  ]);
  expect(connection!.db.select().from(mediaImages).all()).toHaveLength(0);
  expect(connection!.db.select().from(mediaJobs).all()).toHaveLength(0);
});

it('rejects unknown binary content as an unsupported image and retains the cleaned failure result', async () => {
  bytes = Buffer.from([0, 1, 2, 3, 255, 254, 253, 252]);
  const submission = await createSubmission();
  const response = await content(submission.sessions[0].id);
  expect(response.status, await response.clone().text()).toBe(415);
  expect(await response.json()).toMatchObject({
    code: 'MEDIA_IDENTIFICATION_FAILED',
    imageId: null,
  });
  const result = await request(`/api/uploads/submissions/${submission.id}`, {
    headers: { cookie },
  });
  expect(result.status).toBe(200);
  expect((await result.json()).sessions).toMatchObject([
    {
      state: 'failed',
      imageId: null,
      jobId: null,
      cleanupStatus: 'none',
      errorCode: 'MEDIA_IDENTIFICATION_FAILED',
    },
  ]);
  expect(connection!.db.select().from(mediaImages).all()).toHaveLength(0);
  expect(connection!.db.select().from(mediaJobs).all()).toHaveLength(0);
});
