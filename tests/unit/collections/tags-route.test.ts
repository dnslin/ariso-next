import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/tags/route.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: vi.fn(() => ({ error: logError })),
}));

beforeEach(() => vi.clearAllMocks());

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
      message: '标签创建失败，请重试',
    });
    expect(createRuntimeLogger).toHaveBeenCalledWith(
      'collections.tags',
      logLevel,
    );
    expect(logError).toHaveBeenCalledWith(
      { err: error, method: 'POST', path: '/api/tags' },
      'Tag creation failed',
    );
  },
);
