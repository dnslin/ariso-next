import {
  adoptWatermarkAsset,
  watermarkAssetSnapshot,
} from './watermark-assets.ts';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MediaTransaction } from './images.ts';
import { mediaSettings } from './schema.ts';
import {
  initialMediaSettings,
  mediaSettingsInputSchema,
  mediaSettingsPatchSchema,
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

/** Internal full-save contract; the caller owns the transaction and HTTP authorization. */
export function updateMediaSettings(
  tx: MediaTransaction,
  input: unknown,
  now = new Date(),
) {
  const settings = mediaSettingsInputSchema.parse(input);
  requireMediaSettings(tx);
  if (settings.watermarkAssetId)
    adoptWatermarkAsset(tx, settings.watermarkAssetId, now);
  const saved = tx
    .update(mediaSettings)
    .set({ ...settings, updatedAt: now })
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

/** Merge and validate within the same write transaction, including asset adoption. */
export function patchMediaSettings(db: BetterSQLite3Database, input: unknown) {
  const patch = mediaSettingsPatchSchema.parse(input);
  return db.transaction(
    (tx) => {
      const current: Partial<ReturnType<typeof requireMediaSettings>> = {
        ...requireMediaSettings(tx),
      };
      delete current.id;
      delete current.updatedAt;
      return updateMediaSettings(tx, { ...current, ...patch });
    },
    { behavior: 'immediate' },
  );
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
    watermarkText: settings.watermarkText,
    watermarkFont: settings.watermarkFont,
    watermarkFontSize: settings.watermarkFontSize,
    watermarkColor: settings.watermarkColor,
    watermarkStrokeColor: settings.watermarkStrokeColor,
    watermarkStrokeWidth: settings.watermarkStrokeWidth,
    watermarkOpacity: settings.watermarkOpacity,
    watermarkPosition: settings.watermarkPosition,
    watermarkMargin: settings.watermarkMargin,
    watermarkWidth: settings.watermarkWidth,
    watermarkAsset:
      settings.watermarkMode === 'image'
        ? watermarkAssetSnapshot(tx, settings.watermarkAssetId!)
        : null,
    defaultVisibility: settings.defaultVisibility,
  };
}
