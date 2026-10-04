import { afterEach, expect, it, vi } from 'vitest';
import {
  reconcileStorageSave,
  matchesSavedStorage,
  finishStorageDefault,
} from '../../../src/components/storage/storage-reconciliation';
import type { StorageSummary } from '../../../src/components/storage/storage-api';
import { StorageRequestError } from '../../../src/components/storage/storage-api';

const local = {
  id: 'saved-local',
  type: 'local',
  name: '本地归档',
  localPath: 'archive',
  enabled: true,
} as StorageSummary;
afterEach(() => vi.unstubAllGlobals());

it('recovers a lost update response from the authoritative configuration without repeating the mutation', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(local));
  vi.stubGlobal('fetch', fetch);
  const result = await reconcileStorageSave({
    kind: 'update',
    id: local.id,
    input: { name: ' 本地归档 ' },
  });
  expect(result).toMatchObject({
    matched: true,
    storage: { id: local.id },
    credentialsUnverified: false,
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/storages/saved-local', {
    cache: 'no-store',
  });
});

it('does not identify an existing or ambiguous configuration as the result of a lost create response', async () => {
  const input = {
    type: 'local' as const,
    name: local.name,
    localPath: 'archive',
    enabled: true,
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([local])));
  expect(
    await reconcileStorageSave({
      kind: 'create',
      beforeIds: [local.id],
      input,
    }),
  ).toMatchObject({ matched: false });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(Response.json([local, { ...local, id: 'another' }])),
  );
  expect(
    await reconcileStorageSave({ kind: 'create', beforeIds: [], input }),
  ).toMatchObject({ matched: false, storage: undefined });
});

it('matches normalized public fields but never treats credential-presence flags as proof of the replacement value', async () => {
  const s3 = {
    ...local,
    type: 's3',
    endpoint: 'https://s3.example.com',
    pathPrefix: 'images',
    hasAccessKey: true,
    hasSecretKey: true,
  } as StorageSummary;
  const input = {
    endpoint: ' https://s3.example.com/ ',
    pathPrefix: '/images/',
    accessKey: 'replacement',
  };
  expect(matchesSavedStorage(s3, input)).toBe(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(s3)));
  expect(
    await reconcileStorageSave({ kind: 'update', id: s3.id, input }),
  ).toMatchObject({ matched: true, credentialsUnverified: true });
  expect(matchesSavedStorage(s3, { accessKey: null })).toBe(false);
});

it('reads the actual null default and preserves read failures instead of reporting a successful save', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ defaultStorageId: null })),
  );
  expect(
    await reconcileStorageSave({ kind: 'default', id: null, storage: local }),
  ).toMatchObject({ matched: true, storage: local });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await expect(
    reconcileStorageSave({
      kind: 'update',
      id: local.id,
      input: { name: local.name },
    }),
  ).rejects.toThrow('offline');
});

it('finishes a selected default after recovering a created configuration, without creating it twice', async () => {
  let defaultStorageId: string | null = null;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/storages') return Response.json([local]);
    if (init?.method === 'PATCH')
      defaultStorageId = JSON.parse(String(init.body)).defaultStorageId;
    return Response.json({ defaultStorageId });
  });
  vi.stubGlobal('fetch', fetch);
  const pending = {
    kind: 'create' as const,
    beforeIds: [],
    input: {
      type: 'local' as const,
      name: local.name,
      localPath: 'archive',
      enabled: true,
    },
    defaultChoice: true,
  };
  const result = await reconcileStorageSave(pending);
  expect(result.matched).toBe(true);
  await finishStorageDefault(result.storage!, pending.defaultChoice, vi.fn());
  expect(defaultStorageId).toBe(local.id);
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toEqual([]);
});

it('does not write the default on repeated configuration-only saves after another window changes it', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ defaultStorageId: 'other-local' }));
  vi.stubGlobal('fetch', fetch);
  const pending = vi.fn();
  await finishStorageDefault(local, undefined, pending);
  await finishStorageDefault(local, undefined, pending);
  expect(fetch).not.toHaveBeenCalled();
  expect(pending).not.toHaveBeenCalled();
});

it.each([
  [local.id, null],
  ['other-local', 'other-local'],
])(
  'clearing this configuration default preserves another default (%s)',
  async (initial, expected) => {
    let defaultStorageId: string | null = initial;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH')
        defaultStorageId = JSON.parse(String(init.body)).defaultStorageId;
      return Response.json({ defaultStorageId });
    });
    vi.stubGlobal('fetch', fetch);
    await finishStorageDefault(local, false, vi.fn());
    expect(defaultStorageId).toBe(expected);
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(initial === local.id ? 1 : 0);
  },
);

it('tracks an attempted default before its response is lost and only reads that stage back', async () => {
  let defaultStorageId: string | null = null;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      defaultStorageId = JSON.parse(String(init.body)).defaultStorageId;
      throw new TypeError('response lost after the server committed');
    }
    return Response.json({ defaultStorageId });
  });
  vi.stubGlobal('fetch', fetch);
  const pending = vi.fn();
  await expect(finishStorageDefault(local, true, pending)).rejects.toThrow(
    'response lost',
  );
  const result = await reconcileStorageSave(pending.mock.calls[0][0]);
  expect(result).toMatchObject({
    matched: true,
    storage: local,
    settings: { defaultStorageId: local.id },
  });
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
  ).toHaveLength(1);
});

it('preserves an explicit default rejection so the editor can correct a disabled configuration', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ defaultStorageId: null }))
      .mockResolvedValueOnce(
        Response.json(
          { code: 'STORAGE_DISABLED', message: '存储已停用' },
          { status: 409 },
        ),
      ),
  );
  const pending = vi.fn();
  const operation = finishStorageDefault(
    { ...local, enabled: false },
    true,
    pending,
  );
  await expect(operation).rejects.toBeInstanceOf(StorageRequestError);
  await expect(operation).rejects.toMatchObject({
    status: 409,
    code: 'STORAGE_DISABLED',
  });
  expect(pending).toHaveBeenCalledWith({
    kind: 'default',
    id: local.id,
    storage: { ...local, enabled: false },
  });
});
