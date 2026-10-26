import { beforeEach, expect, it, vi } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import {
  createSmartCollection,
  readSmartCollection,
} from '../../../src/server/library/smart-collections.ts';
import { GET, POST } from '../../../src/app/api/library/collections/route.ts';
import {
  GET as readOne,
  PATCH,
  DELETE,
} from '../../../src/app/api/library/collections/[id]/route.ts';
import { POST as resolve } from '../../../src/app/api/library/collections/resolve/route.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
vi.mock('../../../src/server/library/smart-collections.ts', () => ({
  createSmartCollection: vi.fn(),
  readSmartCollection: vi.fn(),
  listSmartCollections: vi.fn(() => []),
  updateSmartCollection: vi.fn(),
  deleteSmartCollection: vi.fn(),
}));
let gate: ReturnType<typeof createContentMutations>;
const record = {
  id: 'saved',
  name: '最近截图',
  rules: { recentDays: '7', tagId: ['real-tag'] },
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z',
};
const context = { params: Promise.resolve({ id: 'saved' }) };
beforeEach(() => {
  vi.clearAllMocks();
  gate = createContentMutations();
  vi.mocked(requireOwner).mockResolvedValue(
    {} as Awaited<ReturnType<typeof requireOwner>>,
  );
  vi.mocked(getServerRuntime).mockReturnValue({
    contentMutations: gate,
    connection: { db: {} },
    config: { logLevel: 'info' },
  } as ReturnType<typeof getServerRuntime>);
  vi.mocked(createSmartCollection).mockReturnValue(record);
  vi.mocked(readSmartCollection).mockReturnValue(record);
});

it('requires the owner session before reading or writing and retains private no-store responses', async () => {
  vi.mocked(requireOwner).mockRejectedValue(
    Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED', status: 401 }),
  );
  const response = await POST(
    new Request('http://ariso.test/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ name: 'name', rules: {} }),
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(createSmartCollection).not.toHaveBeenCalled();
});

it('pauses mutations during backup while retaining reads and boundary resolution', async () => {
  gate.closeAdmission();
  expect(
    (
      await POST(
        new Request('http://ariso.test/api/library/collections', {
          method: 'POST',
          body: '{}',
        }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await PATCH(
        new Request('http://ariso.test/api/library/collections/saved', {
          method: 'PATCH',
          body: '{}',
        }),
        context,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await DELETE(
        new Request('http://ariso.test/api/library/collections/saved', {
          method: 'DELETE',
        }),
        context,
      )
    ).status,
  ).toBe(409);
  expect(
    (await GET(new Request('http://ariso.test/api/library/collections')))
      .status,
  ).toBe(200);
  expect(
    (
      await resolve(
        new Request('http://ariso.test/api/library/collections/resolve', {
          method: 'POST',
          body: '{"recentDays":"7"}',
        }),
      )
    ).status,
  ).toBe(200);
  expect(createSmartCollection).not.toHaveBeenCalled();
});

it('returns a fresh resolved query without inserting a browsing instant into saved rules', async () => {
  const response = await readOne(
    new Request('http://ariso.test/api/library/collections/saved'),
    context,
  );
  const result = await response.json();
  expect(result.collection).toEqual(record);
  expect(new URLSearchParams(result.query).get('tagId')).toBe('real-tag');
  expect(new URLSearchParams(result.query).get('relativeTo')).toBeTruthy();
  expect(result.collection.rules).not.toHaveProperty('relativeTo');
});

it('rejects malformed bodies before writing', async () => {
  const response = await POST(
    new Request('http://ariso.test/api/library/collections', {
      method: 'POST',
      body: '{',
    }),
  );
  expect(response.status).toBe(400);
  expect(createSmartCollection).not.toHaveBeenCalled();
});
