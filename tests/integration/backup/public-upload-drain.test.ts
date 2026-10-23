import { beforeEach, expect, it, vi } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';

const state = vi.hoisted(() => ({
  runtime: {} as Record<string, unknown>,
  authorized: true,
  receipt: vi.fn(() => 'receipt'),
  receive: vi.fn(),
  wait: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => state.runtime,
}));
vi.mock('../../../src/server/identity/tokens.ts', () => ({
  verifyUploadToken: async () =>
    state.authorized ? { tokenId: 'token' } : null,
}));
vi.mock('../../../src/server/upload/public-receive.ts', () => ({
  createPublicReceipt: state.receipt,
}));
vi.mock('../../../src/server/upload/public-result.ts', () => ({
  waitPublicUpload: state.wait,
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error() {} }),
}));
import { publicUploadResponse } from '../../../src/server/upload/public-http.ts';

beforeEach(() => {
  vi.clearAllMocks();
  state.authorized = true;
  state.runtime = {
    contentMutations: createContentMutations(),
    config: { dataDir: '/tmp/ariso-public-drain' },
    connection: { db: {} },
    uploads: { receivePublic: state.receive },
  };
  state.receive.mockResolvedValue({ imageId: 'image', jobId: 'job' });
});

it('keeps the public request active through its media-result wait and drains without cancelling it', async () => {
  const gate = state.runtime.contentMutations as ReturnType<
    typeof createContentMutations
  >;
  const result = Promise.withResolvers<{
    status: number;
    body: { imageId: string };
  }>();
  state.wait.mockReturnValue(result.promise);
  const request = new Request('http://localhost/api/upload', {
    method: 'POST',
    body: 'image',
  });
  const response = publicUploadResponse(request);
  await vi.waitFor(() => expect(state.wait).toHaveBeenCalledOnce());
  expect(gate.activeCount).toBe(1);
  gate.closeAdmission();
  let idle = false;
  const waiting = gate.waitForIdle().then(() => {
    idle = true;
  });
  await Promise.resolve();
  expect(idle).toBe(false);
  expect(request.signal.aborted).toBe(false);
  result.resolve({ status: 201, body: { imageId: 'image' } });
  expect((await response).status).toBe(201);
  await waiting;
  expect(gate.activeCount).toBe(0);
});

it('rejects a paused public upload before creating its receipt or consuming its bytes', async () => {
  (
    state.runtime.contentMutations as ReturnType<typeof createContentMutations>
  ).closeAdmission();
  const request = new Request('http://localhost/api/upload', {
    method: 'POST',
    body: 'image',
  });
  const response = await publicUploadResponse(request);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    imageId: null,
    error: { code: 'SITE_BACKUP_IN_PROGRESS' },
  });
  expect(state.receipt).not.toHaveBeenCalled();
  expect(request.bodyUsed).toBe(false);
});

it('still rejects an invalid bearer token before reporting a paused site', async () => {
  state.authorized = false;
  (
    state.runtime.contentMutations as ReturnType<typeof createContentMutations>
  ).closeAdmission();
  const response = await publicUploadResponse(
    new Request('http://localhost/api/upload', { method: 'POST' }),
  );
  expect(response.status).toBe(401);
  expect(state.receipt).not.toHaveBeenCalled();
});
