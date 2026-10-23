import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { createSecretCrypto } from '../runtime/crypto.ts';
import { storageConfigs } from '../storage/schema.ts';
import { clientConfig } from '../storage/probes.ts';
import { createS3Storage } from '../storage/s3.ts';
import { iterateBackupFiles } from './manifest.ts';

/** Open one required object at a time; no source bucket scan or intermediate remote copy. */
export async function* iterateBackupEntries(options: {
  databasePath: string;
  dataDir: string;
  encryptionKey: Uint8Array;
  signal?: AbortSignal;
}): AsyncGenerator<{ name: string; size: number; source: Readable }> {
  const db = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  const clients = new Map<string, ReturnType<typeof createS3Storage>>();
  try {
    const configurations = new Map(
      drizzle(db)
        .select()
        .from(storageConfigs)
        .all()
        .map((config) => [config.id, config]),
    );
    const secretCrypto = createSecretCrypto(Buffer.from(options.encryptionKey));
    for await (const file of iterateBackupFiles(options)) {
      options.signal?.throwIfAborted();
      let stream: Readable | undefined;
      try {
        if ('path' in file)
          stream = createReadStream(file.path, { signal: options.signal });
        else {
          let client = clients.get(file.storageId);
          if (!client) {
            const config = configurations.get(file.storageId)!;
            client = createS3Storage({
              ...clientConfig({ secretCrypto }, config),
              enabled: config.enabled,
            });
            clients.set(file.storageId, client);
          }
          const read = await client.readObjectForMaintenance(file.key, {
            signal: options.signal,
          });
          stream = read.stream;
          if (read.size !== undefined && read.size !== file.size)
            throw Object.assign(
              new Error(`必需对象大小不一致: ${file.storageId}/${file.key}`),
              { code: 'BACKUP_OBJECT_INVALID' },
            );
        }
        yield { name: file.name, size: file.size, source: stream };
      } catch (cause) {
        if ((cause as { code?: string }).code === 'STORAGE_OBJECT_MISSING')
          throw Object.assign(
            new Error(`必需对象不存在: ${file.name}`, { cause }),
            { code: 'BACKUP_OBJECT_MISSING' },
          );
        throw cause;
      } finally {
        stream?.destroy();
        // Consumption reports the original stream failure; disposal can report it again.
        if (stream)
          await finished(stream, { cleanup: true }).catch(() => undefined);
      }
    }
  } finally {
    for (const client of clients.values()) client.destroy();
    db.close();
  }
}
