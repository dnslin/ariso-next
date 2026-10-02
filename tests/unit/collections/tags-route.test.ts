import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/tags/route.ts';
import { GET as GET_TAG, PATCH } from '../../../src/app/api/tags/[id]/route.ts';
import { CollectionError } from '../../../src/server/collections/errors.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';

const { logError, logInfo, transaction } = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: vi.fn(() => ({ error: logError, info: logInfo })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockReset();
  vi.mocked(getServerRuntime).mockReturnValue({
    config: { logLevel: 'debug' },
    connection: { db: { transaction } },
  } as unknown as ReturnType<typeof getServerRuntime>);
});

it.each(['debug', 'fatal'] as const)(
  'retains tag database failure details using the configured %s log level',
  async (logLevel) => {
    const error = new Error('tag database write failure');
    vi.mocked(getServerRuntime).mockReturnValue({
      config: { logLevel },
      connection: {
        db: {
          transaction: () => {
            throw error;
          },
        },
      },
    } as unknown as ReturnType<typeof getServerRuntime>);

    const response = await POST(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        body: '{"name":"标签"}',
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: '标签操作失败，请重试',
    });
    expect(createRuntimeLogger).toHaveBeenCalledWith(
      'collections.tags',
      logLevel,
    );
    expect(logError).toHaveBeenCalledWith(
      { err: error, method: 'POST', path: '/api/tags' },
      'Tag management failed',
    );
  },
);

it.each([
  {
    route: GET_TAG,
    method: 'GET',
    code: 'COLLECTION_TARGET_NOT_FOUND' as const,
    status: 404,
    message: '标签不存在或已被删除',
  },
  {
    route: PATCH,
    method: 'PATCH',
    code: 'COLLECTION_TAG_CONFLICT' as const,
    status: 409,
    message: '已有同名标签，请使用其他名称',
  },
])(
  'retains $code status $status and domain rejection logs',
  async ({ route, method, code, status, message }) => {
    transaction.mockImplementation(() => {
      throw new CollectionError(code, message);
    });
    const response = await route(
      new Request('http://localhost/api/tags/tag-id', {
        method,
        body: method === 'PATCH' ? '{"name":"Go"}' : undefined,
      }),
      { params: Promise.resolve({ id: 'tag-id' }) },
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ code, message });
    expect(logInfo).toHaveBeenCalledWith(
      { method, path: '/api/tags/tag-id', code, message, status },
      'Tag management rejected',
    );
    expect(logError).not.toHaveBeenCalled();
  },
);

it('logs malformed JSON as a domain input rejection before writing', async () => {
  const response = await POST(
    new Request('http://localhost/api/tags', { method: 'POST', body: '{' }),
  );
  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    code: 'COLLECTION_INVALID_INPUT',
    message: '请求内容必须是有效的 JSON',
  });
  expect(transaction).not.toHaveBeenCalled();
  expect(logInfo).toHaveBeenCalledWith(
    {
      method: 'POST',
      path: '/api/tags',
      code: 'COLLECTION_INVALID_INPUT',
      message: '请求内容必须是有效的 JSON',
      status: 400,
    },
    'Tag management rejected',
  );
  expect(logError).not.toHaveBeenCalled();
});

it('preserves complete tag creation results and reused success diagnostics', async () => {
  const result = {
    tag: {
      id: 'existing-tag',
      displayName: 'Go',
      imageCount: 3,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
    reused: true,
  };
  transaction.mockReturnValue(result);
  const response = await POST(
    new Request('http://localhost/api/tags', {
      method: 'POST',
      body: '{"name":"go"}',
    }),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual(result);
  expect(logInfo).toHaveBeenCalledWith(
    {
      method: 'POST',
      path: '/api/tags',
      tagId: 'existing-tag',
      reused: true,
      changed: undefined,
      deleted: undefined,
      status: 201,
    },
    'Tag management succeeded',
  );
  expect(logError).not.toHaveBeenCalled();
});
