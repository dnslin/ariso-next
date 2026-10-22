import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { selectPreviewVersion } from '../delivery/preview-presentation.ts';
import { getImageAccessState } from '../media/images.ts';
import { mediaImages } from '../media/schema.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { buildSiteUrl } from '../site/urls.ts';
import { storageConfigs } from '../storage/schema.ts';
import { SharingError } from './errors.ts';
import { imageShares, type ImageShareRecord } from './image-schema.ts';
import type { SharingTransaction } from './types.ts';
import type { parseShareQuery } from './configuration.ts';

const createInput = z.strictObject({
  hours: z.union([z.literal(1), z.literal(24), z.literal(168)]).default(24),
  sourceVersion: z.enum(['original', 'compressed', 'thumbnail']),
});
type ImageShareVersion = ImageShareRecord['sourceVersion'];

function currentShare(tx: SharingTransaction, imageId: string) {
  return tx
    .select()
    .from(imageShares)
    .where(eq(imageShares.imageId, imageId))
    .get();
}
function shareState(row: ImageShareRecord, now: Date) {
  return row.revokedAt !== null
    ? ('revoked' as const)
    : now >= row.expiresAt
      ? ('expired' as const)
      : ('active' as const);
}
function serialize(row: ImageShareRecord, publicUrl: string, now: Date) {
  return {
    imageId: row.imageId,
    token: row.token,
    sourceVersion: row.sourceVersion,
    url: buildSiteUrl({ publicUrl }, `/s/image/${row.token}`),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    state: shareState(row, now),
  };
}
export type OwnerImageShare = ReturnType<typeof serialize>;

function imageState(tx: SharingTransaction, imageId: string) {
  const state = getImageAccessState(tx, imageId);
  if (!state)
    throw new SharingError(
      'SHARING_IMAGE_NOT_FOUND',
      '图片不存在或已被删除',
      404,
    );
  const storage = tx
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, state.image.storageId))
    .get();
  if (!storage)
    throw new Error(`Missing image storage: ${state.image.storageId}`);
  return { ...state, storage };
}
function unavailableReason(
  state: ReturnType<typeof imageState>,
  version: ImageShareVersion | null,
) {
  if (state.image.visibility !== 'private')
    return '只有私有图片可以创建临时分享。';
  if (state.image.trashedAt || state.image.deletionStatus)
    return '图片已回收或正在删除。';
  if (state.image.processingStatus !== 'ready') return '图片尚未处理完成。';
  if (!state.storage.enabled) return '图片所属存储已停用。';
  if (
    !version ||
    !state.versions.some((row) => row.kind === version && row.saved)
  )
    return '没有可读取的浏览器预览版本。';
  return null;
}
function preferredVersion(state: ReturnType<typeof imageState>) {
  return selectPreviewVersion(
    state.image,
    state.versions.flatMap((row) =>
      row.saved ? [{ kind: row.kind, mime: row.saved.version.mime }] : [],
    ),
  ) as ImageShareVersion | null;
}

/** Reading settings never creates a share or grants private /i access. */
export function readOwnerImageShare(
  db: BetterSQLite3Database,
  imageId: string,
) {
  return db.transaction((tx) => {
    const state = imageState(tx, imageId);
    const settings = requireSiteSettings(tx);
    const row = currentShare(tx, imageId);
    const now = new Date();
    const sourceVersion =
      row && shareState(row, now) === 'active'
        ? row.sourceVersion
        : preferredVersion(state);
    return {
      share: row ? serialize(row, settings.publicUrl, now) : null,
      sourceVersion,
      unavailableReason: unavailableReason(state, sourceVersion),
      timeZone: settings.timeZone,
    };
  });
}
export type OwnerImageShareSettings = ReturnType<typeof readOwnerImageShare>;

export function createImageShare(
  db: BetterSQLite3Database,
  imageId: string,
  input: unknown,
) {
  const parsed = createInput.safeParse(input);
  if (!parsed.success)
    throw new SharingError(
      'SHARING_INVALID_INPUT',
      '请选择 1 小时、24 小时或 7 天，并核对实际分享版本',
    );
  return db.transaction(
    (tx) => {
      const state = imageState(tx, imageId);
      const now = new Date();
      const current = currentShare(tx, imageId);
      const version =
        current && shareState(current, now) === 'active'
          ? current.sourceVersion
          : preferredVersion(state);
      const reason = unavailableReason(state, version);
      if (reason)
        throw new SharingError('SHARING_IMAGE_UNAVAILABLE', reason, 409);
      const settings = requireSiteSettings(tx);
      if (current && shareState(current, now) === 'active')
        return serialize(current, settings.publicUrl, now);
      if (version !== parsed.data.sourceVersion)
        throw new SharingError(
          'SHARING_IMAGE_CHANGED',
          '可分享的版本已改变，请重新核对后创建',
          409,
        );
      const values = {
        token: randomBytes(32).toString('base64url'),
        sourceVersion: parsed.data.sourceVersion,
        expiresAt: new Date(now.getTime() + parsed.data.hours * 3600000),
        revokedAt: null,
        createdAt: now,
      };
      const row = tx
        .insert(imageShares)
        .values({ imageId, ...values })
        .onConflictDoUpdate({
          target: imageShares.imageId,
          set: values,
        })
        .returning()
        .get();
      return serialize(row, settings.publicUrl, now);
    },
    { behavior: 'immediate' },
  );
}

/** Lifecycle callers revoke in the same transaction as publish/trash/visibility changes. */
export function revokeImageShares(
  tx: SharingTransaction,
  imageId: string,
  now = new Date(),
) {
  return tx
    .update(imageShares)
    .set({ revokedAt: now })
    .where(and(eq(imageShares.imageId, imageId), isNull(imageShares.revokedAt)))
    .run().changes;
}
export function revokeOwnerImageShare(
  db: BetterSQLite3Database,
  imageId: string,
) {
  return db.transaction(
    (tx) => {
      imageState(tx, imageId);
      revokeImageShares(tx, imageId);
      return readOwnerImageShare(tx, imageId);
    },
    { behavior: 'immediate' },
  );
}

/** A token grants exactly its saved role; neither owner Cookies nor request parameters expand it. */
export function selectImageShareDelivery(
  db: BetterSQLite3Database,
  token: string,
  now = new Date(),
) {
  return db.transaction((tx) => {
    const share = tx
      .select()
      .from(imageShares)
      .where(eq(imageShares.token, token))
      .get();
    if (!share)
      throw new SharingError('SHARING_NOT_FOUND', '分享链接无效', 404);
    if (shareState(share, now) !== 'active')
      throw new SharingError('SHARING_UNAVAILABLE', '分享已失效', 410);
    const state = imageState(tx, share.imageId);
    if (
      state.image.visibility !== 'private' ||
      state.image.trashedAt ||
      state.image.deletionStatus
    )
      throw new SharingError('SHARING_UNAVAILABLE', '分享已失效', 410);
    if (unavailableReason(state, share.sourceVersion))
      throw new SharingError(
        'SHARING_IMAGE_UNAVAILABLE',
        '图片暂时无法读取，请稍后重试',
        409,
      );
    const saved = state.versions.find(
      (row) => row.kind === share.sourceVersion,
    )!.saved!;
    return { share, image: state.image, storage: state.storage, ...saved };
  });
}
export function readPublicImageShare(db: BetterSQLite3Database, token: string) {
  const { share } = selectImageShareDelivery(db, token);
  return {
    expiresAt: share.expiresAt.toISOString(),
    mediaUrl: `/s/image/${encodeURIComponent(token)}/media`,
  };
}

export function listImageShares(
  db: BetterSQLite3Database,
  query: ReturnType<typeof parseShareQuery>,
) {
  return db.transaction((tx) => {
    const { q, page, pageSize } = query;
    const filter = q
      ? sql`instr(${mediaImages.displayName}, ${q}) > 0`
      : undefined;
    const total = tx
      .select({ value: count() })
      .from(imageShares)
      .innerJoin(mediaImages, eq(mediaImages.id, imageShares.imageId))
      .where(filter)
      .get()!.value;
    const rows = tx
      .select({ share: imageShares, displayName: mediaImages.displayName })
      .from(imageShares)
      .innerJoin(mediaImages, eq(mediaImages.id, imageShares.imageId))
      .where(filter)
      .orderBy(desc(imageShares.createdAt), asc(imageShares.imageId))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const settings = requireSiteSettings(tx);
    const now = new Date();
    return {
      items: rows.map(({ share, displayName }) => ({
        ...serialize(share, settings.publicUrl, now),
        displayName,
      })),
      total,
      page,
      pageSize,
    };
  });
}
