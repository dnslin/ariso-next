import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../src/server/storage/s3.ts', () => ({
  createS3Storage: fake.create,
}));
import {
  createBackupBrowserS3,
  loadBackupBrowserProvider,
} from '../../../scripts/browser-backup-s3.mjs';
const provider = {
  service: 'r2',
  endpoint: 'https://example.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'image',
  forcePathStyle: false,
  credentials: {
    accessKeyId: 'fixture-key',
    secretAccessKey: 'fixture-secret',
  },
};
const directories: string[] = [];
beforeEach(() => {
  fake.create.mockReset();
});
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function fixture() {
  const deletionOrder: string[] = [];
  const scopes: Array<{
    id: string;
    pathPrefix: string;
    objects: Map<string, Buffer>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  fake.create.mockImplementation(({ id, pathPrefix }) => {
    const scope = {
      id,
      pathPrefix,
      objects: new Map<string, Buffer>(),
      destroy: vi.fn(),
    };
    scopes.push(scope);
    return {
      async writeObject(key: string, bytes: Readable) {
        scope.objects.set(key, await buffer(bytes));
      },
      async readObjectForMaintenance(key: string) {
        const bytes = scope.objects.get(key);
        if (!bytes) throw new Error('Missing fixture object');
        return { stream: Readable.from([bytes]) };
      },
      async *listObjects() {
        yield [...scope.objects.keys()].map((key) => ({ key }));
      },
      async deleteObject(key: string) {
        deletionOrder.push(`${pathPrefix}:${key}`);
        scope.objects.delete(key);
      },
      destroy: scope.destroy,
    };
  });
  let sequence = 0;
  const calls: Array<{
    path: string;
    method: string;
    body: Record<string, unknown>;
  }> = [];
  const source = {
    ownerJson: vi.fn(
      async (path: string, method: string, body: Record<string, unknown>) => {
        calls.push({ path, method, body });
        if (path === '/api/storages' && method === 'POST')
          return Response.json(
            { id: `s3-${++sequence}`, configRevision: 1 },
            { status: 201 },
          );
        return Response.json(path.endsWith('/test') ? { passed: true } : {});
      },
    ),
    request: vi.fn(async (_path: string, { body }: { body: FormData }) => {
      const id = String(body.get('storageId'));
      const scope = scopes.find(
        (scope) => scope.id === id && scope.pathPrefix.includes('/source-'),
      )!;
      const bytes = Buffer.from(await (body.get('file') as Blob).arrayBuffer());
      expect(bytes.length).toBe(420);
      scope.objects.set('images/original.png', bytes);
      return Response.json({ imageId: `image-${id}` }, { status: 201 });
    }),
  };
  return {
    source,
    calls,
    scopes,
    deletionOrder,
    options: {
      source,
      bytes: Buffer.alloc(420),
      token: 'test-token',
      albumId: 'album',
      tagId: 'tag',
      signal: new AbortController().signal,
    },
  };
}
describe('small S3 backup browser fixture ownership', () => {
  it('prepares two distinct source and destination namespaces, retains default/disabled intent and checks the neighboring sentinel through cleanup', async () => {
    const { source, calls, scopes, deletionOrder, options } = fixture();
    const remote = createBackupBrowserS3(provider);
    await remote.prepare(options);
    expect(source.request).toHaveBeenCalledTimes(2);
    expect(remote.imageIds).toEqual(['image-s3-1', 'image-s3-2']);
    expect(new Set(scopes.map((scope) => scope.pathPrefix)).size).toBe(5);
    expect(
      remote.restoreTargets.map(
        (target: { confirmR2: boolean }) => target.confirmR2,
      ),
    ).toEqual([true, true]);
    expect(
      calls
        .filter((call) => call.path.endsWith('/test'))
        .every((call) => call.body.wholeBucketHasNoLockRules === true),
    ).toBe(true);
    expect(calls.slice(-2)).toEqual([
      {
        path: '/api/settings/storage',
        method: 'PATCH',
        body: { defaultStorageId: 's3-1' },
      },
      { path: '/api/storages/s3-2', method: 'PATCH', body: { enabled: false } },
    ]);
    await remote.removeSource();
    expect(
      scopes
        .filter((scope) => scope.pathPrefix.includes('/source-'))
        .every((scope) => scope.objects.size === 0),
    ).toBe(true);
    const sentinel = scopes.find((scope) =>
      scope.pathPrefix.endsWith('/neighbor'),
    )!;
    expect(sentinel.objects.has('sentinel.txt')).toBe(true);
    for (const scope of scopes.filter((scope) =>
      scope.pathPrefix.includes('/destination-'),
    ))
      scope.objects.set('restored.png', Buffer.from('restored'));
    await remote.verifyAfterRestore();
    await remote.close();
    expect(remote.report.sentinelChecks).toEqual([
      'source-prepared',
      'source-removed',
      'restored',
      'after-source-and-destination-cleanup',
    ]);
    expect(deletionOrder.at(-1)).toBe(`${sentinel.pathPrefix}:sentinel.txt`);
    expect(
      scopes.every(
        (scope) =>
          scope.objects.size === 0 && scope.destroy.mock.calls.length === 1,
      ),
    ).toBe(true);
  });
  it('keeps registered scopes available for cleanup when source setup fails midway', async () => {
    const { source, scopes, options } = fixture();
    source.ownerJson.mockImplementation(async (path: string) =>
      path === '/api/storages'
        ? Response.json({ id: 'partial', configRevision: 1 }, { status: 201 })
        : Response.json({ passed: false }),
    );
    const remote = createBackupBrowserS3(provider);
    await expect(remote.prepare(options)).rejects.toThrow('real probe');
    await remote.close();
    expect(scopes).toHaveLength(3);
    expect(scopes.every((scope) => scope.destroy.mock.calls.length === 1)).toBe(
      true,
    );
  });
  it('rejects multi-provider profiles before creating a remote client', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'backup-profile-unit-'));
    directories.push(directory);
    const path = join(directory, 'profile.json');
    await writeFile(
      path,
      JSON.stringify([provider, { ...provider, service: 'seaweedfs' }]),
      { mode: 0o600 },
    );
    await expect(loadBackupBrowserProvider(path)).rejects.toThrow(
      'exactly one provider',
    );
    expect(fake.create).not.toHaveBeenCalled();
  });
});
