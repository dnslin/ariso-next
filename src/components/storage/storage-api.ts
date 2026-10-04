import type {
  readStorage,
  readStorageSettings,
} from '../../server/storage/settings';
import type { listStorageProbes } from '../../server/storage/probes';
import type { readStorageScan } from '../../server/storage/scans';
import type { readStorageOrphanUsage } from '../../server/storage/maintenance';

type JsonValue<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? JsonValue<U>[]
    : T extends object
      ? { [K in keyof T]: JsonValue<T[K]> }
      : T;

export type StorageSummary = JsonValue<ReturnType<typeof readStorage>> & {
  usage?: { knownBytes: number; unconfirmedObjects: number };
};
export type StorageSettings = JsonValue<ReturnType<typeof readStorageSettings>>;
export type StorageDetail = StorageSummary & {
  probes: JsonValue<ReturnType<typeof listStorageProbes>>;
  references: { counts: Record<string, number>; activeWrites: number };
  scan: JsonValue<ReturnType<typeof readStorageScan>>;
  orphans: JsonValue<ReturnType<typeof readStorageOrphanUsage>>;
};

export class StorageRequestError extends Error {
  readonly code?: string;
  readonly fields: { field: string; message: string }[];
  readonly references?: Record<string, number>;
  readonly activeWrites?: number;
  constructor(
    readonly status: number,
    body: {
      message?: string;
      code?: string;
      fields?: { field: string; message: string }[];
      references?: Record<string, number>;
      activeWrites?: number;
    },
  ) {
    super(body.message ?? `存储请求失败（HTTP ${status}）`);
    this.code = body.code;
    this.fields = body.fields ?? [];
    this.references = body.references;
    this.activeWrites = body.activeWrites;
  }
}

export async function storageRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new StorageRequestError(response.status, body);
  return body;
}

export const storageUrl = (id: string) =>
  `/api/storages/${encodeURIComponent(id)}`;
export const storageSettingsUrl = '/api/settings/storage';
