import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/uploads/sessions/[id]/resubmit/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
const resubmit = vi.fn();
const replacement = {
  id: 'new-submission',
  storageId: 's3-storage',
  visibility: 'private',
  maxFileBytes: 52428800,
  batchSize: 20,
  albumIds: ['fixed-album'],
  tagIds: ['fixed-tag'],
  sessions: [],
};
const context = { params: Promise.resolve({ id: 'old-session' }) };
const request = (body: unknown) =>
  new Request('http://ariso.test/api/uploads/sessions/old-session/resubmit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  resubmit.mockResolvedValue(replacement);
  vi.mocked(getServerRuntime).mockReturnValue({
    uploads: { resubmit },
  } as unknown as ReturnType<typeof getServerRuntime>);
});

describe('owner upload signature resubmission route', () => {
  it('requires the owner and accepted origin before reading or resubmitting', async () => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('请求来源不符'), {
        status: 403,
        code: 'INVALID_ORIGIN',
      }),
    );
    const response = await POST(request({ requestId: 'request' }), context);
    expect(response.status).toBe(403);
    expect(getServerRuntime).not.toHaveBeenCalled();
    expect(resubmit).not.toHaveBeenCalled();
  });
  it('returns the replacement frozen submission with no shared caching', async () => {
    const response = await POST(request({ requestId: 'request' }), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(replacement);
    expect(resubmit).toHaveBeenCalledWith('old-session', 'request');
  });
  it.each([
    {},
    { requestId: '' },
    { requestId: 'x'.repeat(256) },
    { requestId: 1 },
    { requestId: 'request', storageId: 'client-picked-target' },
  ])(
    'rejects malformed or additional metadata %j without resubmitting',
    async (body) => {
      const response = await POST(request(body), context);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'UPLOAD_INVALID_INPUT',
      });
      expect(resubmit).not.toHaveBeenCalled();
    },
  );
});
