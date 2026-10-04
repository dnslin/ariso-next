import type {
  StorageCreateInput,
  StorageUpdateInput,
} from '../../server/storage/validation';
import {
  storageRequest,
  storageSettingsUrl,
  storageUrl,
  type StorageSettings,
  type StorageSummary,
} from './storage-api';

export type PendingStorageSave =
  | { kind: 'create'; beforeIds: string[]; input: StorageCreateInput }
  | { kind: 'update'; id: string; input: StorageUpdateInput }
  | { kind: 'default'; id: string | null };

export function matchesSavedStorage(
  storage: StorageSummary,
  input: StorageCreateInput | StorageUpdateInput,
) {
  return Object.entries(input).every(([field, value]) => {
    if (field === 'accessKey' || field === 'secretKey')
      return (
        (field === 'accessKey'
          ? storage.hasAccessKey
          : storage.hasSecretKey) ===
        (value !== null)
      );
    if (field === 'name' || field === 'region' || field === 'bucket')
      value = String(value).trim();
    if (field === 'endpoint') {
      try {
        value = new URL(String(value).trim()).href.replace(/\/$/, '');
      } catch {
        return false;
      }
    }
    if (field === 'pathPrefix') value = String(value).replace(/^\/+|\/+$/g, '');
    return storage[field as keyof StorageSummary] === value;
  });
}

export async function reconcileStorageSave(pending: PendingStorageSave) {
  if (pending.kind === 'default') {
    const settings = await storageRequest<StorageSettings>(storageSettingsUrl);
    return {
      matched: settings.defaultStorageId === pending.id,
      settings,
      credentialsUnverified: false,
    };
  }
  const candidates =
    pending.kind === 'update'
      ? [await storageRequest<StorageSummary>(storageUrl(pending.id))]
      : (await storageRequest<StorageSummary[]>('/api/storages')).filter(
          (storage) =>
            !pending.beforeIds.includes(storage.id) &&
            matchesSavedStorage(storage, pending.input),
        );
  const storage = candidates.length === 1 ? candidates[0] : undefined;
  return {
    matched: Boolean(storage && matchesSavedStorage(storage, pending.input)),
    storage,
    credentialsUnverified: Boolean(
      ('accessKey' in pending.input && pending.input.accessKey) ||
      ('secretKey' in pending.input && pending.input.secretKey),
    ),
    settings: undefined,
  };
}
