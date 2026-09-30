import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/media/watermark-assets/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { mediaError } from '../../../src/server/media/errors.ts';

const { receive, logError } = vi.hoisted(() => ({
  receive: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: logError }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    watermarks: { receive },
  } as unknown as ReturnType<typeof getServerRuntime>);
});
const request = () =>
  new Request('http://localhost/api/media/watermark-assets', {
    method: 'POST',
    body: new FormData(),
  });

async function expectFailure(error: Error, code: string, status: number) {
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body).toEqual({
    code,
    message: error.message,
    requestId: expect.any(String),
  });
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(logError).toHaveBeenCalledWith(
    { err: error, requestId: body.requestId },
    'Watermark upload failed',
  );
}

describe('POST /api/media/watermark-assets', () => {
  it.each([
    ['UNAUTHORIZED', 401],
    ['INVALID_ORIGIN', 403],
  ])(
    'preserves %s before accessing the watermark runtime',
    async (code, status) => {
      const error = Object.assign(new Error('Owner authorization failed'), {
        code,
        status,
      });
      vi.mocked(requireOwner).mockRejectedValue(error);
      await expectFailure(error, code, status);
      expect(getServerRuntime).not.toHaveBeenCalled();
      expect(receive).not.toHaveBeenCalled();
    },
  );

  it('returns the created asset without caching', async () => {
    const asset = { id: 'asset-id', status: 'ready', format: 'PNG' };
    receive.mockResolvedValue(asset);
    const input = request();
    const response = await POST(input);
    expect(requireOwner).toHaveBeenCalledWith(input);
    expect(receive).toHaveBeenCalledWith(input);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(asset);
    expect(logError).not.toHaveBeenCalled();
  });

  it.each([
    ['MEDIA_WATERMARK_REQUEST', 400],
    ['MEDIA_WATERMARK_SIZE', 413],
    ['MEDIA_STOPPING', 503],
  ])('preserves explicit %s failures', async (code, status) => {
    const error = Object.assign(mediaError(code, 'Request rejected'), {
      status,
    });
    receive.mockRejectedValue(error);
    await expectFailure(error, code, status);
  });

  it.each([
    'MEDIA_WATERMARK_INVALID',
    'MEDIA_FORMAT_UNSUPPORTED',
    'MEDIA_IDENTIFICATION_FAILED',
    'MEDIA_RESOURCE_LIMIT',
  ])('returns 422 for %s', async (code) => {
    const error = mediaError(code, 'Watermark validation failed');
    receive.mockRejectedValue(error);
    await expectFailure(error, code, 422);
  });

  it('retains the watermark validation code while preserving its identification cause in diagnostics', async () => {
    const error = mediaError(
      'MEDIA_WATERMARK_INVALID',
      'Invalid watermark image',
      mediaError('MEDIA_IDENTIFICATION_FAILED', 'Unknown image signature'),
    );
    receive.mockRejectedValue(error);
    await expectFailure(error, 'MEDIA_WATERMARK_INVALID', 422);
  });

  it.each([
    Object.assign(
      new Error(
        'ENOSPC: no space left on device, write /data/assets/watermarks/source',
      ),
      { code: 'ENOSPC' },
    ),
    mediaError(
      'INSUFFICIENT_DISK_SPACE',
      'Insufficient disk space at /data/assets/watermarks',
    ),
    Object.assign(
      new Error(
        'Command failed with exit code 1: magick\nmagick: unable to write pixel cache: No space left on device',
      ),
      { exitCode: 1 },
    ),
  ])(
    'returns 507 with the canonical disk error and diagnostic: %s',
    async (error) => {
      receive.mockRejectedValue(error);
      await expectFailure(error, 'INSUFFICIENT_DISK_SPACE', 507);
    },
  );

  it('classifies a real-shaped magick cache failure as resource exhaustion with 422', async () => {
    const error = Object.assign(
      new Error(
        'Command failed with exit code 1: magick -limit disk 536870912 png:/data/assets/watermarks/source null:\nmagick: cache resources exhausted `/data/assets/watermarks/source` @ error/cache.c/OpenPixelCache/3964.',
      ),
      {
        exitCode: 1,
        stderr: 'magick: cache resources exhausted',
        failed: true,
      },
    );
    receive.mockRejectedValue(error);
    await expectFailure(error, 'MEDIA_RESOURCE_LIMIT', 422);
  });

  it('retains an unexpected failure as 500 with its original diagnostic', async () => {
    const error = new Error('Unexpected database failure at /data/ariso.db');
    receive.mockRejectedValue(error);
    await expectFailure(error, 'MEDIA_WATERMARK_FAILED', 500);
  });
});
