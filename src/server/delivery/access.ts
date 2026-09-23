import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getImageAccessState } from '../media/images.ts';
import type { VersionKind } from '../media/schema.ts';
import { requireMediaSettings } from '../media/settings.ts';
import { storageConfigs } from '../storage/schema.ts';
import { resolveImageVersion } from './links.ts';

export function deliveryError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

/** Read after each asynchronous identity/I/O interval; never hold a transaction over I/O. */
export function selectImageDelivery(
  db: BetterSQLite3Database,
  imageId: string,
  selectedVersion: VersionKind | undefined,
  owner: boolean,
) {
  const state = getImageAccessState(db, imageId);
  if (!state) throw deliveryError(404, 'IMAGE_NOT_FOUND', '图片不存在');
  const { image } = state;
  if (image.visibility === 'private' && !owner)
    throw deliveryError(401, 'OWNER_LOGIN_REQUIRED', '请登录后访问私有图片');
  if (image.processingStatus !== 'ready' && !owner)
    throw deliveryError(409, 'IMAGE_NOT_READY', '图片尚未处理完成');
  if (image.trashedAt || image.deletionStatus)
    throw deliveryError(404, 'IMAGE_UNAVAILABLE', '图片已回收或正在删除');
  const storage = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, image.storageId))
    .get();
  if (!storage) throw new Error(`Missing image storage: ${image.storageId}`);
  if (!storage.enabled)
    throw deliveryError(409, 'STORAGE_DISABLED', '图片所属存储已停用');
  const resolved = resolveImageVersion(
    state,
    selectedVersion,
    requireMediaSettings(db).defaultLinkVersion,
  );
  return { image, storage, ...resolved };
}
