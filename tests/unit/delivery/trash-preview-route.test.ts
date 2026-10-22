import { beforeEach, expect, it, vi } from 'vitest';
import { GET, HEAD } from '../../../src/app/api/trash/[id]/preview/route.ts';
import { readOptionalOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { prepareImageDelivery } from '../../../src/server/delivery/response.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  readOptionalOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/delivery/response.ts', async (original) => ({
  ...(await original<
    typeof import('../../../src/server/delivery/response.ts')
  >()),
  prepareImageDelivery: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));

const context = { params: Promise.resolve({ id: 'image-id' }) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
    config: {
      dataDir: '/data',
      encryptionKey: Buffer.alloc(32),
      logLevel: 'info',
    },
  } as unknown as ReturnType<typeof getServerRuntime>);
  vi.mocked(readOptionalOwner).mockResolvedValue(null);
});

it.each([
  ['GET', GET],
  ['HEAD', HEAD],
] as const)(
  'delegates a versioned %s preview to the same owner-only delivery',
  async (method, route) => {
    const request = new Request(
      'http://localhost/api/trash/image-id/preview?type=original&v=current-object',
      { method },
    );
    const response = new Response(null, { status: 200 });
    vi.mocked(prepareImageDelivery).mockResolvedValue(response);
    expect(await route(request, context)).toBe(response);
    expect(prepareImageDelivery).toHaveBeenCalledWith(
      request,
      'image-id',
      expect.objectContaining({
        access: 'trash-preview',
        storageRoot: '/data/storage',
      }),
    );
    const options = vi.mocked(prepareImageDelivery).mock.calls[0][2];
    expect(await options.readOwner()).toBe(false);
    expect(readOptionalOwner).toHaveBeenCalledExactlyOnceWith(request);
  },
);

it.each([
  '?v=current-object',
  '?type=bad&v=current-object',
  '?type=original&type=thumbnail&v=current-object',
  '?type=original&download=1&v=current-object',
  '?type=original&other=1&v=current-object',
])(
  'still rejects invalid or unsupported preview parameters: %s',
  async (query) => {
    const response = await GET(
      new Request(`http://localhost/api/trash/image-id/preview${query}`),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_IMAGE_REQUEST',
    });
    expect(getServerRuntime).not.toHaveBeenCalled();
    expect(prepareImageDelivery).not.toHaveBeenCalled();
  },
);
