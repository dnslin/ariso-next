import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupError } from '../../../src/server/backup/errors.ts';

const control = vi.hoisted(() => ({
  initialized: false,
  authorize: vi.fn(),
  current: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  receive: vi.fn(),
  reset: vi.fn(),
  decrypt: vi.fn(),
  configure: vi.fn(),
  execute: vi.fn(),
  cancel: vi.fn(),
  log: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => ({ restore: control }),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: control.log }),
}));
import { GET as current } from '../../../src/app/api/setup/restore/route.ts';
import {
  GET as read,
  PUT as create,
} from '../../../src/app/api/setup/restore/[id]/route.ts';
import {
  PUT as receive,
  DELETE as reset,
} from '../../../src/app/api/setup/restore/[id]/file/route.ts';
import { POST as decrypt } from '../../../src/app/api/setup/restore/[id]/decryption/route.ts';
import { PUT as configure } from '../../../src/app/api/setup/restore/[id]/site/route.ts';
import { POST as execute } from '../../../src/app/api/setup/restore/[id]/execution/route.ts';
import { POST as cancel } from '../../../src/app/api/setup/restore/[id]/cancel/route.ts';

const id = 'd33430d6-6a78-4fe8-ae02-9d7cd7c5682a';
const context = { params: Promise.resolve({ id }) };
const job = {
  id,
  kind: 'restore',
  status: 'receiving',
  receivedBytes: 0,
  uploadBytes: 17,
};
type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
const endpoints: [string, string, Handler][] = [
  ['GET', '/api/setup/restore', current],
  ['GET', `/api/setup/restore/${id}`, read],
  ['PUT', `/api/setup/restore/${id}`, create],
  ['PUT', `/api/setup/restore/${id}/file`, receive],
  ['DELETE', `/api/setup/restore/${id}/file`, reset],
  ['POST', `/api/setup/restore/${id}/decryption`, decrypt],
  ['PUT', `/api/setup/restore/${id}/site`, configure],
  ['POST', `/api/setup/restore/${id}/execution`, execute],
  ['POST', `/api/setup/restore/${id}/cancel`, cancel],
];
const request = (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: {
      'X-Ariso-Setup-Code': 'current-code',
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  control.initialized = false;
  control.authorize.mockImplementation((code: string) => {
    if (control.initialized)
      throw new BackupError('SETUP_ALREADY_COMPLETED', 409, '站点已初始化');
    if (code !== 'current-code')
      throw new BackupError('INVALID_SETUP_CODE', 401, '初始化码无效');
  });
  control.current.mockReturnValue({
    job,
    application: { version: 'v1', revision: 'revision' },
  });
  control.read.mockReturnValue(job);
  control.create.mockReturnValue(job);
  control.receive.mockResolvedValue({
    ...job,
    receivedBytes: 17,
    status: 'received',
  });
  control.reset.mockResolvedValue(job);
  control.decrypt.mockReturnValue({ ...job, status: 'decrypting' });
  control.configure.mockResolvedValue({
    ...job,
    status: 'configuring',
    publicUrl: 'https://new.example',
  });
  control.execute.mockResolvedValue({ ...job, status: 'restoring' });
  control.cancel.mockResolvedValue({ ...job, status: 'cancelled' });
});

describe('restore initialization-code boundary', () => {
  for (const [method, path, handler] of endpoints) {
    it(`${method} ${path} authorizes before parsing or consuming any body`, async () => {
      const input = new Request(`http://localhost${path}`, { method });
      const body = vi.fn(() => {
        throw new Error('unauthorized stream consumed');
      });
      Object.defineProperty(input, 'body', { get: body });
      const response = await handler(input, context);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        code: 'INVALID_SETUP_CODE',
        message: '初始化码无效',
      });
      expect(control.authorize).toHaveBeenCalledExactlyOnceWith('');
      expect(body).not.toHaveBeenCalled();
      for (const operation of [
        control.current,
        control.create,
        control.read,
        control.receive,
        control.reset,
        control.decrypt,
        control.configure,
        control.execute,
        control.cancel,
      ])
        expect(operation).not.toHaveBeenCalled();
    });
  }
  it('returns the initialized-site conflict and login destination without consuming an upload', async () => {
    control.initialized = true;
    const input = request('PUT', `/api/setup/restore/${id}`, {
      uploadBytes: 17,
    });
    const response = await create(input, context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'SETUP_ALREADY_COMPLETED',
      message: '站点已初始化',
      redirectTo: '/login',
    });
    expect(input.bodyUsed).toBe(false);
    expect(control.create).not.toHaveBeenCalled();
  });
  it('does not accept the task ID or backup password as initialization authority', async () => {
    const input = request(
      'POST',
      `/api/setup/restore/${id}/decryption`,
      { password: 'current-code' },
      { 'X-Ariso-Setup-Code': id },
    );
    const response = await decrypt(input, context);
    expect(response.status).toBe(401);
    expect(input.bodyUsed).toBe(false);
    expect(control.decrypt).not.toHaveBeenCalled();
  });
});

it('returns current/read state and creates one authorized task with the declared file size', async () => {
  const root = await current(request('GET', '/api/setup/restore'));
  expect(await root.json()).toEqual(control.current.mock.results[0].value);
  const existing = await read(
    request('GET', `/api/setup/restore/${id}`),
    context,
  );
  expect(await existing.json()).toEqual({ job });
  const created = await create(
    request('PUT', `/api/setup/restore/${id}`, { uploadBytes: 17 }),
    context,
  );
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({ job });
  expect(control.create).toHaveBeenCalledExactlyOnceWith(id, 17);
});
it.each([
  {},
  { uploadBytes: 0 },
  { uploadBytes: -1 },
  { uploadBytes: 1.1 },
  { uploadBytes: Number.MAX_SAFE_INTEGER + 1 },
  { uploadBytes: 17, overwrite: true },
])('rejects invalid or extra creation fields %#', async (body) => {
  const response = await create(
    request('PUT', `/api/setup/restore/${id}`, body),
    context,
  );
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe('RESTORE_INVALID_INPUT');
  expect(control.create).not.toHaveBeenCalled();
});
it('rejects a non-UUID job path after authorization and before body consumption', async () => {
  const input = request('PUT', '/api/setup/restore/invalid', {
    uploadBytes: 17,
  });
  const response = await create(input, {
    params: Promise.resolve({ id: '../outside' }),
  });
  expect(response.status).toBe(400);
  expect(input.bodyUsed).toBe(false);
  expect(control.create).not.toHaveBeenCalled();
});
it('hands the original binary request to the receiver after validating its offsets', async () => {
  const input = new Request(`http://localhost/api/setup/restore/${id}/file`, {
    method: 'PUT',
    headers: {
      'X-Ariso-Setup-Code': 'current-code',
      'Content-Type': 'application/octet-stream',
      'Upload-Offset': '8',
      'Upload-Length': '17',
    },
    body: '123456789',
  });
  control.receive.mockImplementation(
    async (actualId, actualRequest, offset, total) => {
      expect(control.authorize).toHaveBeenCalledExactlyOnceWith('current-code');
      expect(actualRequest).toBe(input);
      expect(input.bodyUsed).toBe(false);
      expect([actualId, offset, total]).toEqual([id, 8, 17]);
      expect(await actualRequest.text()).toBe('123456789');
      return { ...job, status: 'received', receivedBytes: 17 };
    },
  );
  const response = await receive(input, context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    job: { status: 'received', receivedBytes: 17 },
  });
});
const invalidUploadHeaders: Record<string, string>[] = [
  { 'Upload-Offset': '-1', 'Upload-Length': '17' },
  { 'Upload-Offset': '1.2', 'Upload-Length': '17' },
  { 'Upload-Offset': '1e3', 'Upload-Length': '17' },
  { 'Upload-Offset': '9007199254740992', 'Upload-Length': '17' },
  { 'Upload-Offset': '0', 'Upload-Length': '0' },
  { 'Upload-Offset': '0', 'Upload-Length': '9007199254740992' },
  { 'Upload-Offset': '', 'Upload-Length': '17' },
  { 'Upload-Length': '17' },
];
it.each(invalidUploadHeaders)(
  'rejects invalid upload headers before consuming bytes %#',
  async (headers) => {
    const input = request('PUT', `/api/setup/restore/${id}/file`, 'bytes', {
      'content-type': 'application/octet-stream',
      ...headers,
    });
    const response = await receive(input, context);
    expect(response.status).toBe(400);
    expect(input.bodyUsed).toBe(false);
    expect(control.receive).not.toHaveBeenCalled();
  },
);
it('rejects nonbinary file content types before opening the receiver', async () => {
  const input = request('PUT', `/api/setup/restore/${id}/file`, 'bytes', {
    'Upload-Offset': '0',
    'Upload-Length': '17',
  });
  const response = await receive(input, context);
  expect(response.status).toBe(415);
  expect(input.bodyUsed).toBe(false);
  expect(control.receive).not.toHaveBeenCalled();
});
it('passes receiver offset conflicts through without retrying or discarding the confirmed prefix', async () => {
  control.receive.mockRejectedValue(
    new BackupError('BACKUP_UPLOAD_OFFSET', 409, '请查询已接收位置'),
  );
  const response = await receive(
    request('PUT', `/api/setup/restore/${id}/file`, 'bytes', {
      'content-type': 'application/octet-stream',
      'Upload-Offset': '0',
      'Upload-Length': '17',
    }),
    context,
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'BACKUP_UPLOAD_OFFSET' });
  expect(control.receive).toHaveBeenCalledTimes(1);
  expect(control.reset).not.toHaveBeenCalled();
});
it('preserves the exact decryption password and starts the background task', async () => {
  const password = '  恢复密码\n';
  const response = await decrypt(
    request('POST', `/api/setup/restore/${id}/decryption`, { password }),
    context,
  );
  expect(response.status).toBe(202);
  expect(control.decrypt).toHaveBeenCalledExactlyOnceWith(id, password);
  expect(await response.json()).toMatchObject({
    job: { status: 'decrypting' },
  });
});
it('normalizes the saved public URL using the existing site contract', async () => {
  const response = await configure(
    request('PUT', `/api/setup/restore/${id}/site`, {
      publicUrl: ' https://NEW.example/ ',
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect(control.configure).toHaveBeenCalledExactlyOnceWith(
    id,
    'https://new.example',
  );
  expect(await response.json()).toMatchObject({
    job: { status: 'configuring', publicUrl: 'https://new.example' },
  });
});
it.each([
  { publicUrl: 'https://new.example/path' },
  { publicUrl: 'https://user:secret@new.example' },
  { publicUrl: 'https://new.example', oldKey: 'secret' },
])('rejects invalid destination URLs and unknown fields %#', async (body) => {
  const response = await configure(
    request('PUT', `/api/setup/restore/${id}/site`, body),
    context,
  );
  expect(response.status).toBe(400);
  expect(control.configure).not.toHaveBeenCalled();
});
it('execution accepts only an empty request and returns the asynchronous job', async () => {
  const response = await execute(
    request('POST', `/api/setup/restore/${id}/execution`),
    context,
  );
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ job: { status: 'restoring' } });
  control.execute.mockClear();
  const invalid = await execute(
    request('POST', `/api/setup/restore/${id}/execution`, {}),
    context,
  );
  expect(invalid.status).toBe(400);
  expect(control.execute).not.toHaveBeenCalled();
});
it('waits for reset/cancel controllers to finish and returns their resulting task state', async () => {
  const pending = Promise.withResolvers<typeof job>();
  control.reset.mockReturnValue(pending.promise);
  let replied = false;
  const resetting = reset(
    request('DELETE', `/api/setup/restore/${id}/file`),
    context,
  ).then((response) => {
    replied = true;
    return response;
  });
  await vi.waitFor(() => expect(control.reset).toHaveBeenCalledOnce());
  expect(replied).toBe(false);
  pending.resolve(job);
  expect(await (await resetting).json()).toEqual({ job });
  const cancelled = await cancel(
    request('POST', `/api/setup/restore/${id}/cancel`),
    context,
  );
  expect(await cancelled.json()).toMatchObject({
    job: { status: 'cancelled' },
  });
  expect(control.cancel).toHaveBeenCalledExactlyOnceWith(id);
});
it('uses bounded JSON and does not return unexpected diagnostic credentials', async () => {
  const oversized = await decrypt(
    request('POST', `/api/setup/restore/${id}/decryption`, {
      password: 'x'.repeat(256 * 1024),
    }),
    context,
  );
  expect(oversized.status).toBe(413);
  expect(control.decrypt).not.toHaveBeenCalled();
  control.current.mockImplementation(() => {
    throw new Error('private password diagnostic');
  });
  const response = await current(request('GET', '/api/setup/restore'));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private password diagnostic');
  expect(control.log).toHaveBeenCalled();
});
