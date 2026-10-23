import { beforeEach, expect, it, vi } from 'vitest';
import { BackupError } from '../../../src/server/backup/errors.ts';
const control = vi.hoisted(() => ({
  authorize: vi.fn(),
  saveTarget: vi.fn(),
  testTarget: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => ({ restore: control }),
}));
import { PUT } from '../../../src/app/api/setup/restore/[id]/targets/[storageId]/route.ts';
import { POST } from '../../../src/app/api/setup/restore/[id]/targets/[storageId]/test/route.ts';
const id = 'e84c1fcb-57bb-4d43-98e7-1a9120cda9ae';
const context = {
  params: Promise.resolve({ id, storageId: 'remote-storage' }),
};
const value = {
  endpoint: 'https://new.example.test/',
  region: 'auto',
  bucket: 'new-bucket',
  pathPrefix: '/new-prefix/',
  forcePathStyle: false,
  accessKey: 'new-access',
  secretKey: 'new-secret',
};
const job = {
  id,
  status: 'configuring',
  targets: [
    {
      storageId: 'remote-storage',
      credentialsConfigured: true,
      testStatus: 'testing',
    },
  ],
};
function request(method: string, body: unknown, code = 'valid-code') {
  return new Request(
    'http://localhost/api/setup/restore/' + id + '/targets/remote-storage',
    {
      method,
      headers: {
        'content-type': 'application/json',
        'X-Ariso-Setup-Code': code,
      },
      body: JSON.stringify(body),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  control.authorize.mockImplementation((code: string) => {
    if (code !== 'valid-code')
      throw new BackupError('INVALID_SETUP_CODE', 401, '初始化码无效');
  });
  control.saveTarget.mockResolvedValue(job);
  control.testTarget.mockResolvedValue(job);
});
for (const [method, handler] of [
  ['PUT', PUT],
  ['POST', POST],
] as const)
  it(`${method} checks initialization authority before route parameters or credential body`, async () => {
    const input = request(method, value, '');
    const read = vi.fn(() => {
      throw new Error('unauthorized body read');
    });
    Object.defineProperty(input, 'body', { get: read });
    const params = vi.fn(() => {
      throw new Error('unauthorized params read');
    });
    const badContext = {
      get params() {
        return params();
      },
    };
    expect((await handler(input, badContext)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(params).not.toHaveBeenCalled();
    expect(control.saveTarget).not.toHaveBeenCalled();
    expect(control.testTarget).not.toHaveBeenCalled();
  });
it('normalizes location fields while keeping credential bytes unchanged and returns no credentials', async () => {
  const input = {
    ...value,
    accessKey: ' access with space ',
    secretKey: ' secret with space ',
  };
  const response = await PUT(request('PUT', input), context);
  expect(response.status).toBe(200);
  expect(control.saveTarget).toHaveBeenCalledExactlyOnceWith(
    id,
    'remote-storage',
    {
      ...input,
      endpoint: 'https://new.example.test',
      pathPrefix: 'new-prefix',
    },
  );
  const body = await response.text();
  expect(body).not.toContain(input.accessKey);
  expect(body).not.toContain(input.secretKey);
  expect(JSON.parse(body)).toEqual({ job });
});
it.each([
  { ...value, secretKey: null },
  { ...value, accessKey: '' },
  { ...value, secretKey: '••••' },
  { ...value, password: 'wrong-field' },
])(
  'rejects invalid target credentials or unknown fields before changing configuration',
  async (input) => {
    expect((await PUT(request('PUT', input), context)).status).toBe(400);
    expect(control.saveTarget).not.toHaveBeenCalled();
  },
);
it('permits omitted keys for preserving an already-saved credential', async () => {
  const { accessKey: _a, secretKey: _s, ...input } = value;
  void _a;
  void _s;
  expect((await PUT(request('PUT', input), context)).status).toBe(200);
  expect(control.saveTarget.mock.calls[0][2]).not.toHaveProperty('accessKey');
});
it('awaits the accepted target snapshot and never invents R2 owner confirmation', async () => {
  const response = await POST(request('POST', { revision: 3 }), context);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job });
  expect(control.testTarget).toHaveBeenCalledExactlyOnceWith(
    id,
    'remote-storage',
    { revision: 3 },
  );
});
it('passes an explicit R2 lock confirmation for the exact revision', async () => {
  const response = await POST(
    request('POST', { revision: 3, wholeBucketHasNoLockRules: true }),
    context,
  );
  expect(response.status).toBe(202);
  expect(control.testTarget).toHaveBeenCalledExactlyOnceWith(
    id,
    'remote-storage',
    { revision: 3, wholeBucketHasNoLockRules: true },
  );
});
it.each([
  {},
  { revision: 0 },
  { revision: 3.5 },
  { revision: 3, wholeBucketHasNoLockRules: 'true' },
])(
  'rejects invalid test intents before issuing remote requests',
  async (body) => {
    expect((await POST(request('POST', body), context)).status).toBe(400);
    expect(control.testTarget).not.toHaveBeenCalled();
  },
);
it('keeps state conflicts as structured failures', async () => {
  control.saveTarget.mockRejectedValue(
    new BackupError('RESTORE_TARGET_FROZEN', 409, '目标位置已固定'),
  );
  const response = await PUT(request('PUT', value), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    code: 'RESTORE_TARGET_FROZEN',
    message: '目标位置已固定',
  });
});
