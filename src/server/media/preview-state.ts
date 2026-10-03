import { join, sep } from 'node:path';
import { rm } from 'node:fs/promises';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MediaRuntime } from './process.ts';
import { mediaPreviews } from './schema.ts';
import type { PreviewInput } from './preview-validation.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import { terminateMediaTools } from './tools.ts';
import {
  releasePreviewWatermark,
  retainPreviewWatermark,
} from './watermark-assets.ts';

export const pathFor = (runtime: MediaRuntime, id: string) =>
  `${runtime.temporaryRoot}${sep}preview-${id}`;
export const previewError = (code: string, message: string, status: number) =>
  Object.assign(mediaError(code, message), { status });

export function requirePreview(
  runtime: { db: BetterSQLite3Database },
  id: string,
) {
  const row = runtime.db
    .select()
    .from(mediaPreviews)
    .where(eq(mediaPreviews.id, id))
    .get();
  if (!row)
    throw previewError('MEDIA_PREVIEW_NOT_FOUND', `预览不存在: ${id}`, 404);
  return row;
}

export function claimNextPreview(runtime: { db: BetterSQLite3Database }) {
  const next = runtime.db
    .select()
    .from(mediaPreviews)
    .where(eq(mediaPreviews.status, 'queued'))
    .orderBy(asc(mediaPreviews.createdAt), asc(sql`${mediaPreviews}.rowid`))
    .get();
  if (!next) return null;
  return (
    runtime.db
      .update(mediaPreviews)
      .set({ status: 'running', updatedAt: new Date() })
      .where(
        and(eq(mediaPreviews.id, next.id), eq(mediaPreviews.status, 'queued')),
      )
      .returning()
      .get() ?? null
  );
}

/** The source directory is registered before reception, and never becomes a storage object. */
export function queuePreview(
  runtime: MediaRuntime,
  id: string,
  input: PreviewInput,
) {
  return runtime.db.transaction((tx) => {
    const row = requirePreview({ ...runtime, db: tx }, id);
    if (row.status !== 'receiving')
      throw previewError('MEDIA_PREVIEW_INACTIVE', '预览已停止接收', 409);
    const { watermarkAssetId, ...settings } = input.settings;
    const watermarkAsset =
      settings.watermarkMode === 'image'
        ? retainPreviewWatermark(tx, id, watermarkAssetId!)
        : null;
    return tx
      .update(mediaPreviews)
      .set({
        target: input.target,
        snapshot: { ...settings, defaultVisibility: 'private', watermarkAsset },
        status: 'queued',
        updatedAt: new Date(),
      })
      .where(eq(mediaPreviews.id, id))
      .returning()
      .get()!;
  });
}

/** Only settled tasks enter this function. A failed cleanup remains retryable and visible. */
export async function cleanupPreview(runtime: MediaRuntime, id: string) {
  const row = requirePreview(runtime, id);
  if (
    ['receiving', 'queued', 'running'].includes(row.status) ||
    row.cleanupStatus === 'deleted'
  )
    return;
  const directory = pathFor(runtime, id);
  try {
    await terminateMediaTools(join(directory, 'work'));
    await rm(directory, { recursive: true, force: true });
    runtime.db.transaction((tx) => {
      releasePreviewWatermark(tx, id);
      tx.update(mediaPreviews)
        .set({ cleanupStatus: 'deleted', updatedAt: new Date() })
        .where(eq(mediaPreviews.id, id))
        .run();
    });
  } catch (error) {
    const diagnostic = analyzeMediaError(error).diagnostic;
    runtime.db
      .update(mediaPreviews)
      .set({
        cleanupStatus: 'failed',
        cleanupError: diagnostic,
        updatedAt: new Date(),
      })
      .where(eq(mediaPreviews.id, id))
      .run();
    runtime.logger.error(
      { err: error, previewId: id, path: directory },
      'Preview cleanup failed',
    );
    if ((error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED')
      throw error;
  }
}
