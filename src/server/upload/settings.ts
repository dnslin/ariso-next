import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { UploadError } from './errors.ts';
import { uploadSettings } from './schema.ts';

const MiB = 1024 * 1024;
const settingsInputSchema = z.strictObject({
  maxFileMiB: z
    .number()
    .int()
    .positive()
    .max(Math.floor(Number.MAX_SAFE_INTEGER / MiB)),
  batchSize: z.number().int().min(1).max(200),
  queueLimit: z.number().int().min(100).max(2000),
});

export function requireUploadSettings(db: BetterSQLite3Database) {
  const settings = db
    .select()
    .from(uploadSettings)
    .where(eq(uploadSettings.id, 1))
    .get();
  if (!settings)
    throw new UploadError('UPLOAD_NOT_INITIALIZED', '上传设置尚未初始化', 409);
  return {
    maxFileMiB: settings.maxFileBytes / MiB,
    maxFileBytes: settings.maxFileBytes,
    batchSize: settings.batchSize,
    queueLimit: settings.queueLimit,
  };
}

/** Merge and validate the limits together; existing submissions retain their snapshot. */
export function patchUploadSettings(db: BetterSQLite3Database, input: unknown) {
  const patch = settingsInputSchema.partial().safeParse(input);
  if (!patch.success)
    throw new UploadError('UPLOAD_SETTINGS_INVALID', patch.error.message, 422);
  return db.transaction(
    (tx) => {
      const current = requireUploadSettings(tx);
      const parsed = settingsInputSchema.safeParse({
        maxFileMiB: current.maxFileMiB,
        batchSize: current.batchSize,
        queueLimit: current.queueLimit,
        ...patch.data,
      });
      if (!parsed.success)
        throw new UploadError(
          'UPLOAD_SETTINGS_INVALID',
          parsed.error.message,
          422,
        );
      const settings = parsed.data;
      if (settings.batchSize > settings.queueLimit)
        throw new UploadError(
          'UPLOAD_SETTINGS_INVALID',
          '批次大小不能超过队列上限',
          422,
        );
      tx.update(uploadSettings)
        .set({
          maxFileBytes: settings.maxFileMiB * MiB,
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
