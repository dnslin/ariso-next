import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { readMediaSettings } from '../media/settings.ts';
import { storageConfigs, storageSettings } from '../storage/schema.ts';
import { UploadError } from './errors.ts';
import { uploadSettings } from './schema.ts';

/** Current choices for the page; createSubmission freezes settings when submitted. */
export function readUploadPageSettings(db: BetterSQLite3Database) {
  return db.transaction((tx) => {
    const upload = tx
      .select({ maxFileBytes: uploadSettings.maxFileBytes })
      .from(uploadSettings)
      .where(eq(uploadSettings.id, 1))
      .get();
    const media = readMediaSettings(tx);
    const storage = tx
      .select({ defaultStorageId: storageSettings.defaultStorageId })
      .from(storageSettings)
      .where(eq(storageSettings.id, 1))
      .get();
    if (!upload || !media || !storage)
      throw new UploadError(
        'UPLOAD_NOT_INITIALIZED',
        '上传设置尚未初始化',
        409,
      );
    return {
      maxFileBytes: upload.maxFileBytes,
      defaultVisibility: media.defaultVisibility,
      defaultStorageId: storage.defaultStorageId,
      storages: tx
        .select({
          id: storageConfigs.id,
          name: storageConfigs.name,
          enabled: storageConfigs.enabled,
        })
        .from(storageConfigs)
        .where(eq(storageConfigs.type, 'local'))
        .orderBy(asc(storageConfigs.createdAt), asc(storageConfigs.id))
        .all(),
    };
  });
}
