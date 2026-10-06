import { describe, expect, it, vi } from 'vitest';
import { UploadError } from '../../../src/server/upload/errors.ts';

const verify = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../../src/server/identity/tokens.ts', () => ({
  verifyUploadToken: verify,
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
import {
  publicUploadFailure,
  publicUploadResponse,
} from '../../../src/server/upload/public-http.ts';
import { publicUploadErrorSchema } from '../../../src/server/upload/public-contract.ts';

it('returns 401 before looking at the multipart body or registering a receipt', async () => {
  const request = new Request('http://localhost/api/upload', {
    method: 'POST',
  });
  const read = vi.fn(() => {
    throw new Error('body must not be consumed');
  });
  Object.defineProperty(request, 'body', { get: read });
  const result = await publicUploadResponse(request);
  expect(result.status).toBe(401);
  expect(await result.json()).toMatchObject({
    imageId: null,
    status: 'not_created',
    error: { code: 'UPLOAD_TOKEN_INVALID', stage: 'authentication' },
    requestId: expect.any(String),
  });
  expect(read).not.toHaveBeenCalled();
  expect(verify).toHaveBeenCalledWith(request);
});

describe('public failures preserve codes, stages and the asset boundary', () => {
  it.each([
    ['STORAGE_DISABLED', 409],
    ['DEFAULT_STORAGE_UNSET', 409],
    ['COLLECTION_TARGET_REMOVED', 409],
    ['COLLECTION_INVALID_INPUT', 400],
    ['STORAGE_OPERATION_FAILED', 502],
    ['MEDIA_IDENTIFICATION_FAILED', 415],
    ['MEDIA_TOOL_UNAVAILABLE', 503],
    ['MEDIA_TOOL_TIMEOUT', 504],
    ['STORAGE_TIMEOUT', 504],
    ['ENOSPC', 507],
    ['INSUFFICIENT_DISK_SPACE', 507],
  ])('maps %s to HTTP %i without inventing an asset', (code, status) => {
    const error = Object.assign(new Error('actual failure'), {
      code,
      stage: 'finalizing',
    });
    const result = publicUploadFailure(error, 'request-1', 'receiving');
    expect(result.status).toBe(status);
    expect(result.body).toEqual({
      imageId: null,
      status: 'not_created',
      error: { code, stage: 'finalizing', message: 'actual failure' },
      requestId: 'request-1',
    });
    expect(publicUploadErrorSchema.safeParse(result.body).success).toBe(true);
  });
  it('preserves the original failure when cleanup also fails', () => {
    const error = new AggregateError([
      new UploadError('UPLOAD_FILE_TOO_LARGE', 'too large', 413),
      new Error('cleanup failed'),
    ]);
    Object.assign(error, { stage: 'finalizing' });
    expect(publicUploadFailure(error, 'request-1', 'receiving')).toMatchObject({
      status: 413,
      body: {
        imageId: null,
        error: { code: 'UPLOAD_FILE_TOO_LARGE', stage: 'finalizing' },
      },
    });
  });
});
