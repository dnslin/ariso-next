import { describe, expect, it, vi } from 'vitest';
import { uploadResponse } from '../../../src/server/upload/http.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));

describe('upload HTTP error classification', () => {
  it.each([
    ['STORAGE_OPERATION_FAILED', 500],
    ['STORAGE_OBJECT_MISSING', 500],
    ['COLLECTION_DATABASE_ERROR', 500],
    ['STORAGE_DISABLED', 409],
    ['STORAGE_NOT_FOUND', 409],
    ['DEFAULT_STORAGE_UNSET', 409],
    ['DEFAULT_STORAGE_DISABLED', 409],
    ['COLLECTION_TARGET_NOT_FOUND', 409],
    ['COLLECTION_TARGET_REMOVED', 409],
    ['COLLECTION_IMAGE_UNAVAILABLE', 409],
    ['COLLECTION_INVALID_INPUT', 400],
  ])('maps %s to %i', async (code, status) => {
    const response = await uploadResponse(
      new Request('http://localhost/api/uploads'),
      () => {
        throw Object.assign(new Error('diagnostic details'), { code });
      },
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      code,
      message: 'diagnostic details',
    });
  });
});
