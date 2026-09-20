import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MediaTransaction } from './images.ts';
import { mediaSettings } from './schema.ts';
import {
  initialMediaSettings,
  mediaSettingsInputSchema,
  type ProcessingSnapshot,
} from './validation.ts';

export function readMediaSettings(db: BetterSQLite3Database) {
  return (
    db.select().from(mediaSettings).where(eq(mediaSettings.id, 1)).get() ?? null
  );
}

export function requireMediaSettings(db: BetterSQLite3Database) {
  const settings = readMediaSettings(db);
  if (!settings) {
    throw Object.assign(new Error('媒体设置尚未初始化'), {
      code: 'MEDIA_NOT_INITIALIZED',
    });
  }
  return settings;
}

/** The setup owner commits this synchronous transaction with site and identity. */
export function prepareInitialMedia(tx: MediaTransaction) {
  tx.insert(mediaSettings)
    .values({ ...initialMediaSettings, updatedAt: new Date() })
    .onConflictDoNothing({ target: mediaSettings.id })
    .run();
  return requireMediaSettings(tx);
}

/** Internal full-save contract; HTTP authorization and watermark assets belong to later tasks. */
export function updateMediaSettings(tx: MediaTransaction, input: unknown) {
  const settings = mediaSettingsInputSchema.parse(input);
  const saved = tx
    .update(mediaSettings)
    .set({ ...settings, updatedAt: new Date() })
    .where(eq(mediaSettings.id, 1))
    .returning()
    .get();
  if (!saved) {
    throw Object.assign(new Error('媒体设置尚未初始化'), {
      code: 'MEDIA_NOT_INITIALIZED',
    });
  }
  return saved;
}

/** A fresh value for each upload batch. Delivery and scheduling read live settings instead. */
export function createProcessingSnapshot(
  tx: MediaTransaction,
): ProcessingSnapshot {
  const settings = requireMediaSettings(tx);
  return {
    compressionEnabled: settings.compressionEnabled,
    outputFormat: settings.outputFormat,
    quality: settings.quality,
    maxEdge: settings.maxEdge,
    jpegBackground: settings.jpegBackground,
    watermarkMode: settings.watermarkMode,
    defaultVisibility: settings.defaultVisibility,
  };
}
