import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupError } from '../../../src/server/backup/errors.ts';

const control = vi.hoisted(() => ({
  list: vi.fn(),
  activity: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  download: vi.fn(),
  fileInfo: vi.fn(),
  remove: vi.fn(),
  log: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => ({ backups: control }),
}));
vi.mock('../../../src/server/identity/auth.ts', () => ({
  getAuth: () => ({
    options: { baseURL: 'http://localhost' },
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get('cookie') === 'owner=fixture'
          ? { user: { id: 'owner' }, session: { id: 'session' } }
          : null,
    },
  }),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: control.log }),
}));
import { GET as list } from '../../../src/app/api/backups/route.ts';
import { GET as activity } from '../../../src/app/api/backups/activity/route.ts';
import {
  GET as read,
  PUT as create,
  DELETE as remove,
} from '../../../src/app/api/backups/[id]/route.ts';
import { POST as cancel } from '../../../src/app/api/backups/[id]/cancel/route.ts';
import {
  GET as download,
  HEAD as head,
} from '../../../src/app/api/backups/[id]/file/route.ts';

const id = 'd33430d6-6a78-4fe8-ae02-9d7cd7c5682a';
const context = { params: Promise.resolve({ id }) };
const job = {
  id,
  kind: 'backup',
  status: 'ready',
  fileName: 'ariso-fixture.zip.age',
};
type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
const endpoints: [string, string, Handler][] = [
  ['GET', '/api/backups', list],
  ['GET', '/api/backups/activity', activity],
  ['GET', `/api/backups/${id}`, read],
  ['PUT', `/api/backups/${id}`, create],
  ['DELETE', `/api/backups/${id}`, remove],
  ['POST', `/api/backups/${id}/cancel`, cancel],
  ['GET', `/api/backups/${id}/file`, download],
  ['HEAD', `/api/backups/${id}/file`, head],
];
function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      cookie: 'owner=fixture',
      origin: 'http://localhost',
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  control.list.mockResolvedValue({
    items: [job],
    nextCursor: null,
    availability: { supported: true },
  });
  control.activity.mockReturnValue({ paused: true, job });
  control.read.mockResolvedValue(job);
  control.create.mockResolvedValue({ ...job, status: 'preparing' });
  control.cancel.mockResolvedValue({ ...job, status: 'cancelled' });
  control.remove.mockResolvedValue(undefined);
  control.fileInfo.mockResolvedValue({
    fileName: '备份 2026.zip.age',
    size: 9,
  });
  control.download.mockImplementation(async () => ({
    fileName: '备份 2026.zip.age',
    size: 9,
    stream: Readable.from([Buffer.from('encrypted')], { objectMode: false }),
  }));
});

describe('owner backup HTTP authorization', () => {
  for (const [method, path, handler] of endpoints) {
    it(`${method} ${path} requires the owner before body/controller access`, async () => {
      const input = request(method, path, undefined, {
        cookie: '',
        authorization: 'Bearer not-an-owner-cookie',
      });
      const body = vi.fn(() => {
        throw new Error('unauthorized body was read');
      });
      Object.defineProperty(input, 'body', { get: body });
      const response = await handler(input, context);
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(body).not.toHaveBeenCalled();
      for (const operation of [
        control.list,
        control.activity,
        control.read,
        control.create,
        control.cancel,
        control.remove,
        control.download,
        control.fileInfo,
      ])
        expect(operation).not.toHaveBeenCalled();
      if (method === 'HEAD') expect(await response.text()).toBe('');
      else
        expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }
  it.each(endpoints.filter(([method]) => !['GET', 'HEAD'].includes(method)))(
    '%s %s checks the current Origin before reading input',
    async (method, path, handler) => {
      const input = request(
        method,
        path,
        { password: 'secret' },
        { origin: 'https://other.example' },
      );
      const response = await handler(input, context);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      expect(input.bodyUsed).toBe(false);
    },
  );
});

it('preserves the original nonempty password and returns the accepted task', async () => {
  const password = '  密码🫧 \n';
  const response = await create(
    request('PUT', `/api/backups/${id}`, { password }),
    context,
  );
  expect(response.status).toBe(202);
  expect(control.create).toHaveBeenCalledExactlyOnceWith(id, password);
  expect(await response.json()).toMatchObject({
    job: { id, status: 'preparing' },
  });
});
it.each([
  {},
  { password: '' },
  { password: 123 },
  { password: 'x', overwrite: true },
])('rejects invalid or extra create fields %#', async (body) => {
  const response = await create(
    request('PUT', `/api/backups/${id}`, body),
    context,
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    code: 'BACKUP_INVALID_INPUT',
    fields: expect.any(Array),
  });
  expect(control.create).not.toHaveBeenCalled();
});
it('rejects malformed and oversized JSON without creating a task', async () => {
  for (const [body, expected] of [
    ['{', 400],
    [JSON.stringify({ password: 'x'.repeat(256 * 1024) }), 413],
  ] as const) {
    const response = await create(
      new Request(`http://localhost/api/backups/${id}`, {
        method: 'PUT',
        headers: { cookie: 'owner=fixture', origin: 'http://localhost' },
        body,
      }),
      context,
    );
    expect(response.status).toBe(expected);
    expect((await response.json()).code).toBe('BACKUP_INVALID_INPUT');
  }
  expect(control.create).not.toHaveBeenCalled();
});
it('validates UUIDs before passing a job path to the controller', async () => {
  const response = await read(request('GET', '/api/backups/invalid'), {
    params: Promise.resolve({ id: '../outside' }),
  });
  expect(response.status).toBe(400);
  expect(control.read).not.toHaveBeenCalled();
});
it('uses one canonical UUID for directory lookup and cursor comparisons', async () => {
  await read(request('GET', `/api/backups/${id.toUpperCase()}`), {
    params: Promise.resolve({ id: id.toUpperCase() }),
  });
  expect(control.read).toHaveBeenCalledExactlyOnceWith(id);
  await list(request('GET', `/api/backups?cursor=${id.toUpperCase()}`));
  expect(control.list).toHaveBeenCalledExactlyOnceWith({
    limit: 20,
    cursor: id,
  });
});
it('returns list/activity payloads unchanged and accepts bounded cursor pagination', async () => {
  expect(
    await (
      await list(request('GET', `/api/backups?limit=100&cursor=${id}`))
    ).json(),
  ).toEqual(await control.list.mock.results[0].value);
  expect(control.list).toHaveBeenCalledExactlyOnceWith({
    limit: 100,
    cursor: id,
  });
  expect(
    await (await activity(request('GET', '/api/backups/activity'))).json(),
  ).toEqual({ paused: true, job });
  expect(
    await (await read(request('GET', `/api/backups/${id}`), context)).json(),
  ).toEqual({ job });
});
it.each([
  'limit=0',
  'limit=101',
  'limit=1.5',
  'limit=1&limit=2',
  'cursor=invalid',
  'extra=value',
  '__proto__=value',
])('rejects an invalid list query %s', async (query) => {
  const response = await list(request('GET', `/api/backups?${query}`));
  expect(response.status).toBe(400);
  expect(control.list).not.toHaveBeenCalled();
});
it('passes duplicate conflicts through without retrying create', async () => {
  control.create.mockRejectedValueOnce(
    new BackupError('BACKUP_IN_PROGRESS', 409, '已有任务'),
  );
  const response = await create(
    request('PUT', `/api/backups/${id}`, { password: 'x' }),
    context,
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    code: 'BACKUP_IN_PROGRESS',
    message: '已有任务',
  });
  expect(control.create).toHaveBeenCalledTimes(1);
});
it('waits for cancellation settlement and deletes a terminal task with no response body', async () => {
  const pending = Promise.withResolvers<typeof job>();
  control.cancel.mockReturnValue(pending.promise);
  let replied = false;
  const response = cancel(
    request('POST', `/api/backups/${id}/cancel`),
    context,
  ).then((value) => {
    replied = true;
    return value;
  });
  await vi.waitFor(() => expect(control.cancel).toHaveBeenCalledOnce());
  expect(replied).toBe(false);
  pending.resolve(job);
  expect((await response).status).toBe(200);
  const deleted = await remove(
    request('DELETE', `/api/backups/${id}`),
    context,
  );
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe('');
  expect(control.remove).toHaveBeenCalledExactlyOnceWith(id);
});
it('streams an attachment with an encoded name, no shared caching and the exact bytes', async () => {
  const response = await download(
    request('GET', `/api/backups/${id}/file`),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/octet-stream');
  expect(response.headers.get('content-length')).toBe('9');
  expect(response.headers.get('content-disposition')).toContain('attachment;');
  expect(response.headers.get('content-disposition')).toContain(
    "filename*=UTF-8''",
  );
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await response.text()).toBe('encrypted');
});
it('HEAD reads metadata without opening a download stream', async () => {
  const response = await head(
    request('HEAD', `/api/backups/${id}/file`),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-length')).toBe('9');
  expect(await response.text()).toBe('');
  expect(control.fileInfo).toHaveBeenCalledExactlyOnceWith(id);
  expect(control.download).not.toHaveBeenCalled();
});
it('cancelling a response body closes its underlying download stream', async () => {
  const stream = new Readable({ read() {} });
  control.download.mockResolvedValue({
    fileName: 'backup.zip.age',
    size: 9,
    stream,
  });
  const response = await download(
    request('GET', `/api/backups/${id}/file`),
    context,
  );
  await response.body!.cancel();
  expect(stream.destroyed).toBe(true);
});
it('an aborted HTTP request closes the download even before the response body is consumed', async () => {
  const stream = new Readable({ read() {} });
  control.download.mockResolvedValue({
    fileName: 'backup.zip.age',
    size: 9,
    stream,
  });
  const abort = new AbortController();
  const input = new Request(`http://localhost/api/backups/${id}/file`, {
    headers: { cookie: 'owner=fixture' },
    signal: abort.signal,
  });
  const response = await download(input, context);
  abort.abort();
  try {
    await vi.waitFor(() => expect(stream.destroyed).toBe(true));
  } finally {
    await Promise.allSettled([response.body!.cancel()]);
  }
});
it('keeps internal details in diagnostics and out of the HTTP response', async () => {
  const underlying = new Error('private diagnostic /data/secret');
  control.list.mockRejectedValue(
    new Error('SQL includes sensitive parameters', { cause: underlying }),
  );
  const response = await list(request('GET', '/api/backups'));
  expect(response.status).toBe(500);
  const body = await response.text();
  expect(body).not.toContain('private diagnostic');
  expect(body).not.toContain('sensitive parameters');
  expect(control.log).toHaveBeenCalledWith(
    expect.objectContaining({ err: underlying }),
    expect.any(String),
  );
});
