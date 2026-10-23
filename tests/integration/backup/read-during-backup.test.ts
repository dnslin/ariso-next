import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { createArchiveService } from '../../../src/server/delivery/archive.ts';
import { createCountFixture } from '../analytics/count-fixture.ts';

const state = vi.hoisted(() => ({
  runtime: {} as Record<string, unknown>,
  preview: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => state.runtime,
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: async () => ({ user: { id: 'owner' } }),
}));
import { GET as library } from '../../../src/app/api/images/route.ts';
import { POST as selection } from '../../../src/app/api/images/selection/route.ts';
import { POST as copy } from '../../../src/app/api/images/copy/route.ts';
import { POST as status } from '../../../src/app/api/images/status/route.ts';
import { POST as archive } from '../../../src/app/api/images/archives/route.ts';
import { GET as download } from '../../../src/app/api/images/archives/[id]/route.ts';
import { POST as preview } from '../../../src/app/api/media/previews/route.ts';

let fixture: Awaited<ReturnType<typeof createCountFixture>>;
let archives: ReturnType<typeof createArchiveService>;
let gate: ReturnType<typeof createContentMutations>;
beforeEach(async () => {
  fixture = await createCountFixture();
  gate = createContentMutations();
  gate.closeAdmission();
  archives = createArchiveService({
    db: fixture.db,
    storageRoot: join(fixture.directory, 'storage'),
    secretCrypto: createSecretCrypto(Buffer.alloc(32, 1)),
    logger: { error() {} },
  });
  state.preview.mockResolvedValue({
    id: 'temporary-preview',
    status: 'queued',
  });
  state.runtime = {
    contentMutations: gate,
    connection: fixture.connection,
    config: { logLevel: 'silent' },
    archive: archives,
    mediaQueue: { previews: { receive: state.preview } },
  };
});
afterEach(async () => {
  await archives.close();
  await fixture.close();
  vi.clearAllMocks();
});
const request = (path: string, body: unknown) =>
  new Request(`http://localhost/api/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

it('keeps real library, selection, link-copy and status queries available under closed admission', async () => {
  const ids = [fixture.imageId];
  for (const response of [
    await library(new Request('http://localhost/api/images')),
    await selection(request('images/selection', { ids, query: '' })),
    await status(request('images/status', { ids })),
  ]) {
    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.imageId }),
      ]),
    );
  }
  const response = await copy(
    request('images/copy', {
      ids,
      query: '',
      version: 'original',
      format: 'url',
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        imageId: fixture.imageId,
        actualVersion: 'original',
      }),
    ]),
  );
  expect(gate.activeCount).toBe(0);
  expect(gate.paused).toBe(true);
});

it('keeps existing image ZIP downloads available without opening content admission', async () => {
  const prepared = await archive(
    request('images/archives', {
      ids: [fixture.imageId],
      query: '',
      version: 'original',
    }),
  );
  expect(prepared.status).toBe(200);
  const { downloadUrl } = await prepared.json();
  const response = await download(
    new Request(`http://localhost${downloadUrl}`),
    { params: Promise.resolve({ id: downloadUrl.split('/').at(-1) }) },
  );
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  expect(bytes.byteLength).toBeGreaterThan(fixture.bytes.length);
  expect(gate.paused).toBe(true);
});

it('keeps the temporary preview HTTP entry separate from persistent content mutations', async () => {
  const input = request('media/previews', {});
  const response = await preview(input);
  expect(response.status).toBe(202);
  expect(state.preview).toHaveBeenCalledWith(input);
  expect(gate.activeCount).toBe(0);
  expect(gate.paused).toBe(true);
});
