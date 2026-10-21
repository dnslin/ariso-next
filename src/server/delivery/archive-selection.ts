import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  archiveVersions,
  type ArchiveRequest,
} from '../library/archive-types.ts';
import {
  LibraryQueryError,
  parseLibraryQuery,
} from '../library/query-schema.ts';
import { readLibrarySelection } from '../library/selection.ts';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import { readObject } from '../storage/local.ts';
import { clientConfig } from '../storage/probes.ts';
import { createS3Storage } from '../storage/s3.ts';
import { requireLocalStorage } from '../storage/settings.ts';
import { selectImageDelivery } from './access.ts';
import { downloadName } from './headers.ts';

export type ArchiveTarget = ReturnType<typeof selectImageDelivery> & {
  filename: string;
};
export type ArchiveStorage = {
  db: BetterSQLite3Database;
  storageRoot: string;
  secretCrypto?: ReturnType<typeof createSecretCrypto>;
};
const inputSchema = z.strictObject({
  ids: z.array(z.string().min(1)).min(1).max(200),
  query: z.string(),
  version: z.enum(archiveVersions),
});

export function parseArchiveRequest(input: unknown): ArchiveRequest {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError(
      '打包下载需要 1–200 张图片、筛选条件和固定版本',
      'ARCHIVE_INVALID_REQUEST',
    );
  const query = parseLibraryQuery(new URLSearchParams(parsed.data.query));
  if (
    query.page !== null ||
    query.cursor !== null ||
    query.filters.scope === 'trash'
  )
    throw new LibraryQueryError(
      '打包下载仅接受正常图库或相册的筛选条件，不接受页码或游标',
      'ARCHIVE_INVALID_REQUEST',
    );
  return { ...parsed.data, ids: [...new Set(parsed.data.ids)] };
}

export function archiveSelection(
  options: ArchiveStorage,
  input: ArchiveRequest,
) {
  const selected = readLibrarySelection(options.db, {
    ids: input.ids,
    query: input.query,
  });
  return new Set(selected.items.map((item) => item.id));
}

export function selectArchiveTarget(
  options: ArchiveStorage,
  input: ArchiveRequest,
  imageId: string,
  names: Set<string>,
): ArchiveTarget {
  const target = selectImageDelivery(options.db, imageId, input.version, true);
  const filename = downloadName({
    extension: target.version.format,
    displayName: target.image.displayName,
    imageId,
  });
  const dot = filename.lastIndexOf('.');
  let available = filename;
  for (
    let index = 2;
    names.has(available.normalize('NFC').toLowerCase());
    index++
  )
    available = `${filename.slice(0, dot)} (${index})${filename.slice(dot)}`;
  names.add(available.normalize('NFC').toLowerCase());
  return { ...target, filename: available };
}

export async function openArchiveObject(
  options: ArchiveStorage,
  target: ArchiveTarget,
  signal: AbortSignal,
): Promise<{ stream: Readable; size: number }> {
  signal.throwIfAborted();
  if (target.storage.type === 'local') {
    requireLocalStorage(target.storage);
    return readObject(
      options.storageRoot,
      target.storage,
      target.object.key,
      target.version.mime,
      signal,
    );
  }
  if (!options.secretCrypto)
    throw new Error('S3 archive delivery requires runtime secret crypto');
  const storage = createS3Storage(
    clientConfig({ secretCrypto: options.secretCrypto }, target.storage),
  );
  try {
    const result = await storage.readObject(target.object.key, { signal });
    result.stream.once('close', () => storage.destroy());
    if (result.size === undefined) {
      await closeArchiveSource(result.stream);
      throw new Error(`S3 archive source has no size: ${target.object.id}`);
    }
    return { stream: result.stream, size: result.size };
  } catch (error) {
    storage.destroy();
    throw error;
  }
}

export async function closeArchiveSource(stream: Readable) {
  const closed = finished(stream, { cleanup: true }).catch(() => undefined);
  stream.destroy();
  await closed;
}
