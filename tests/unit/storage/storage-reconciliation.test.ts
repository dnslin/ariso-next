import { afterEach, expect, it, vi } from 'vitest';
import {
  reconcileStorageSave,
  matchesSavedStorage,
} from '../../../src/components/storage/storage-reconciliation';
import type { StorageSummary } from '../../../src/components/storage/storage-api';

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
    await reconcileStorageSave({ kind: 'default', id: null }),
  ).toMatchObject({ matched: true });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await expect(
    reconcileStorageSave({
      kind: 'update',
      id: local.id,
      input: { name: local.name },
    }),
  ).rejects.toThrow('offline');
});
