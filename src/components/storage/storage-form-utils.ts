import type { StorageSummary } from './storage-api';
import type {
  StorageCreateInput,
  StorageUpdateInput,
} from '../../server/storage/validation';

export type StorageFormInput = {
  type: 'local' | 's3';
  name: string;
  localPath: string;
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  forcePathStyle: boolean;
  accessKey: string;
  secretKey: string;
  enabled: boolean;
};

export function storageFormInitial(storage?: StorageSummary): StorageFormInput {
  return {
    type: storage?.type ?? 'local',
    name: storage?.name ?? '',
    localPath: storage?.localPath ?? '',
    endpoint: storage?.endpoint ?? '',
    region: storage?.region ?? 'auto',
    bucket: storage?.bucket ?? '',
    pathPrefix: storage?.pathPrefix ?? '',
    forcePathStyle: storage?.forcePathStyle ?? false,
    accessKey: '',
    secretKey: '',
    enabled: storage?.enabled ?? true,
  };
}

export function storageFormConfigChanged(
  input: StorageFormInput,
  storage?: StorageSummary,
) {
  if (!storage || input.type !== storage.type) return true;
  if (input.type === 'local') return input.localPath !== storage.localPath;
  return (
    input.endpoint !== storage.endpoint ||
    input.region !== storage.region ||
    input.bucket !== storage.bucket ||
    input.pathPrefix !== storage.pathPrefix ||
    input.forcePathStyle !== storage.forcePathStyle ||
    input.accessKey.trim() !== '' ||
    input.secretKey.trim() !== ''
  );
}

export function storageFormPayload(
  input: StorageFormInput,
  storage?: StorageSummary,
): StorageCreateInput | StorageUpdateInput {
  const shared = { type: input.type, name: input.name };
  const candidate: StorageCreateInput =
    input.type === 'local'
      ? {
          ...shared,
          type: 'local',
          localPath: input.localPath,
          enabled: input.enabled,
        }
      : {
          ...shared,
          type: 's3',
          endpoint: input.endpoint,
          region: input.region,
          bucket: input.bucket,
          pathPrefix: input.pathPrefix,
          forcePathStyle: input.forcePathStyle,
          enabled: false,
          ...(input.accessKey.trim() ? { accessKey: input.accessKey } : {}),
          ...(input.secretKey.trim() ? { secretKey: input.secretKey } : {}),
        };
  if (!storage) return candidate;
  const update: StorageUpdateInput = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (key === 'enabled') continue;
    if (value !== storage[key as keyof StorageSummary])
      Object.assign(update, { [key]: value });
  }
  const enabled =
    input.type === 's3' && storageFormConfigChanged(input, storage)
      ? false
      : input.enabled;
  if (enabled !== storage.enabled) update.enabled = enabled;
  return update;
}
