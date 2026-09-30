import { createMediaResources } from './resources.ts';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MediaTransaction } from './images.ts';
import type { WatermarkAssetSnapshot } from './validation.ts';
import {
  mediaWatermarkAssets as assets,
  mediaWatermarkPreviewRefs as previews,
  mediaJobs,
  mediaSettings,
} from './schema.ts';
import { mediaError } from './errors.ts';
import { terminateMediaTools } from './tools.ts';
import {
  validateWatermarkFile,
  WATERMARK_MAX_BYTES,
} from './watermark-validation.ts';

export type WatermarkContext = {
  db: BetterSQLite3Database;
  watermarksRoot: string;
  resources?: ReturnType<typeof createMediaResources>;
  /** Upload owns its records; composition supplies this synchronous transaction query. */
  hasUploadReference: (tx: MediaTransaction, assetId: string) => boolean;
};
export function getWatermarkAsset(db: BetterSQLite3Database, id: string) {
  return db.select().from(assets).where(eq(assets.id, id)).get() ?? null;
}
function selectableAsset(db: BetterSQLite3Database, id: string, now: Date) {
  const asset = getWatermarkAsset(db, id);
  if (
    !asset ||
    asset.status !== 'ready' ||
    (asset.expiresAt && asset.expiresAt <= now)
  )
    throw Object.assign(
      mediaError(
        'MEDIA_WATERMARK_UNAVAILABLE',
        `水印素材不存在、已到期或正在清理: ${id}`,
      ),
      { status: 409 },
    );
  return asset;
}
export function watermarkAssetSnapshot(
  db: BetterSQLite3Database,
  id: string,
  now = new Date(),
): WatermarkAssetSnapshot {
  const asset = selectableAsset(db, id, now);
  return {
    id: asset.id,
    path: asset.path,
    format: asset.format!,
    mime: asset.mime!,
    width: asset.width!,
    height: asset.height!,
    byteSize: asset.byteSize,
  };
}
export function adoptWatermarkAsset(
  tx: MediaTransaction,
  id: string,
  now = new Date(),
) {
  selectableAsset(tx, id, now);
  tx.update(assets)
    .set({ expiresAt: null, updatedAt: now })
    .where(eq(assets.id, id))
    .run();
}
/** Call in the same transaction that creates a preview. Release only after its work settles. */
export function retainPreviewWatermark(
  tx: MediaTransaction,
  previewId: string,
  assetId: string,
  now = new Date(),
) {
  const snapshot = watermarkAssetSnapshot(tx, assetId, now);
  tx.insert(previews).values({ previewId, assetId }).run();
  return snapshot;
}
export function releasePreviewWatermark(
  tx: MediaTransaction,
  previewId: string,
) {
  tx.delete(previews).where(eq(previews.previewId, previewId)).run();
}

/** Persist the exact owned directory before I/O; a crash cannot leave unowned files. */
export async function createWatermarkAsset(
  context: WatermarkContext,
  bytes: Buffer,
  signal: AbortSignal,
  now = new Date(),
) {
  if (!bytes.length || bytes.length > WATERMARK_MAX_BYTES)
    throw Object.assign(
      mediaError('MEDIA_WATERMARK_SIZE', '水印素材必须非空且不超过 5 MiB'),
      { status: bytes.length ? 413 : 400 },
    );
  signal.throwIfAborted();
  const id = randomUUID();
  const path = `${id}/source`;
  const workspace = join(context.watermarksRoot, id);
  context.db
    .insert(assets)
    .values({
      id,
      path,
      byteSize: bytes.length,
      status: 'writing',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const resources = (context.resources ??= createMediaResources());
  let budget: ReturnType<typeof resources.beginStep> | undefined;
  try {
    await mkdir(workspace, { recursive: true });
    resources.reserveWrite(id, workspace, bytes.length);
    await writeFile(join(context.watermarksRoot, path), bytes, {
      flag: 'wx',
      signal,
    });
    resources.releaseWrite(id);
    budget = resources.beginStep({
      temporaryDirectory: workspace,
      storageDirectory: workspace,
    });
    const facts = await validateWatermarkFile(
      join(context.watermarksRoot, path),
      workspace,
      AbortSignal.any([signal, budget.signal]),
      budget.diskLimitBytes,
    );
    budget.check();
    signal.throwIfAborted();
    return context.db
      .update(assets)
      .set({
        ...facts,
        status: 'ready',
        expiresAt: new Date(now.getTime() + 3_600_000),
        updatedAt: now,
      })
      .where(eq(assets.id, id))
      .returning()
      .get()!;
  } catch (error) {
    const failure = budget?.signal.aborted ? budget.signal.reason : error;
    context.db
      .update(assets)
      .set({
        status: 'cleanup_pending',
        error: failure instanceof Error ? failure.message : String(failure),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, id))
      .run();
    throw failure;
  } finally {
    budget?.close();
    resources.releaseWrite(id);
  }
}

function referenced(
  tx: MediaTransaction,
  id: string,
  context: WatermarkContext,
) {
  return Boolean(
    tx
      .select({ id: mediaSettings.id })
      .from(mediaSettings)
      .where(eq(mediaSettings.watermarkAssetId, id))
      .get() ||
    tx
      .select({ id: mediaJobs.id })
      .from(mediaJobs)
      .where(
        and(
          inArray(mediaJobs.status, ['queued', 'running']),
          sql`json_extract(${mediaJobs.snapshot}, '$.watermarkAsset.id') = ${id}`,
        ),
      )
      .get() ||
    tx
      .select({ id: previews.previewId })
      .from(previews)
      .where(eq(previews.assetId, id))
      .get() ||
    context.hasUploadReference(tx, id),
  );
}
/** Only startup calls this, before accepting uploads; normal maintenance leaves writers alone. */
export function recoverWatermarkAssets(db: BetterSQLite3Database) {
  db.update(assets)
    .set({
      status: 'cleanup_pending',
      error: 'MEDIA_INTERRUPTED: Watermark upload interrupted',
      updatedAt: new Date(),
    })
    .where(eq(assets.status, 'writing'))
    .run();
}

export async function cleanupWatermarkAssets(
  context: WatermarkContext,
  now = new Date(),
) {
  const candidates = context.db
    .select({ id: assets.id })
    .from(assets)
    .where(
      sql`${assets.status} in ('cleanup_pending', 'cleanup_failed') or (${assets.status} = 'ready' and (${assets.expiresAt} is null or ${assets.expiresAt} <= ${now.getTime()}))`,
    )
    .all();
  const failures: { id: string; error: unknown }[] = [];
  for (const { id } of candidates) {
    const asset = context.db.transaction(
      (tx) => {
        const current = getWatermarkAsset(tx, id);
        if (
          !current ||
          ['writing', 'deleted'].includes(current.status) ||
          referenced(tx, id, context)
        )
          return null;
        if (
          current.status === 'ready' &&
          current.expiresAt &&
          current.expiresAt > now
        )
          return null;
        return tx
          .update(assets)
          .set({ status: 'cleanup_pending', updatedAt: now })
          .where(eq(assets.id, id))
          .returning()
          .get()!;
      },
      { behavior: 'immediate' },
    );
    if (!asset) continue;
    try {
      const workspace = dirname(join(context.watermarksRoot, asset.path));
      await terminateMediaTools(workspace);
      await rm(workspace, { recursive: true, force: true });
      context.db
        .update(assets)
        .set({ status: 'deleted', error: null, updatedAt: now })
        .where(eq(assets.id, id))
        .run();
    } catch (error) {
      context.db
        .update(assets)
        .set({
          status: 'cleanup_failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: now,
        })
        .where(eq(assets.id, id))
        .run();
      failures.push({ id, error });
    }
  }
  return failures;
}
