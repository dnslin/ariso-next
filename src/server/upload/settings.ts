import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  UPLOAD_MIB_BYTES,
  uploadSettingsFieldErrors,
  uploadSettingsInputSchema,
  uploadSettingsPatchSchema,
} from '../../shared/upload-settings.ts';
import { UploadError } from './errors.ts';
import { uploadSettings } from './schema.ts';

export function requireUploadSettings(db: BetterSQLite3Database) {
  const settings = db
    .select()
    .from(uploadSettings)
    .where(eq(uploadSettings.id, 1))
    .get();
  if (!settings)
    throw new UploadError('UPLOAD_NOT_INITIALIZED', '上传设置尚未初始化', 409);
  return {
    maxFileMiB: settings.maxFileBytes / UPLOAD_MIB_BYTES,
    maxFileBytes: settings.maxFileBytes,
    batchSize: settings.batchSize,
    queueLimit: settings.queueLimit,
  };
}

/** Merge and validate the limits together; existing submissions retain their snapshot. */
export function patchUploadSettings(db: BetterSQLite3Database, input: unknown) {
  const patch = uploadSettingsPatchSchema.safeParse(input);
  if (!patch.success)
    throw new UploadError(
      'UPLOAD_SETTINGS_INVALID',
      '请检查上传限制字段',
      422,
      null,
      uploadSettingsFieldErrors(patch.error),
    );
  return db.transaction(
    (tx) => {
      const current = requireUploadSettings(tx);
      const parsed = uploadSettingsInputSchema.safeParse({
        maxFileMiB: current.maxFileMiB,
        batchSize: current.batchSize,
        queueLimit: current.queueLimit,
        ...patch.data,
      });
      if (!parsed.success)
        throw new UploadError(
          'UPLOAD_SETTINGS_INVALID',
          '请检查上传限制字段',
          422,
          null,
          uploadSettingsFieldErrors(parsed.error),
        );
      const settings = parsed.data;
      tx.update(uploadSettings)
        .set({
          maxFileBytes: settings.maxFileMiB * UPLOAD_MIB_BYTES,
          batchSize: settings.batchSize,
          queueLimit: settings.queueLimit,
          updatedAt: new Date(),
        })
        .where(eq(uploadSettings.id, 1))
        .run();
      return requireUploadSettings(tx);
    },
    { behavior: 'immediate' },
  );
}
