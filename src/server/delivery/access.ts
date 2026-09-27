import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getImageAccessState } from '../media/images.ts';
import type { VersionKind } from '../media/schema.ts';
import { requireMediaSettings } from '../media/settings.ts';
import { storageConfigs } from '../storage/schema.ts';
import { deliveryError } from './errors.ts';
import { resolveImageVersion } from './links.ts';

/** Read after each asynchronous identity/I/O interval; never hold a transaction over I/O. */
export function selectImageDelivery(
  db: BetterSQLite3Database,
  imageId: string,
  selectedVersion: VersionKind | undefined,
  owner: boolean,
  access: 'published' | 'trash-preview' = 'published',
) {
  if (access === 'trash-preview' && !owner)
    throw deliveryError('OWNER_LOGIN_REQUIRED');
  const state = getImageAccessState(db, imageId);
  if (!state) throw deliveryError('IMAGE_NOT_FOUND');
  const { image } = state;
  if (image.visibility === 'private' && !owner)
    throw deliveryError('OWNER_LOGIN_REQUIRED');
  if (image.processingStatus !== 'ready' && !owner)
    throw deliveryError('IMAGE_NOT_READY');
  if (
    image.deletionStatus ||
    (access === 'trash-preview' ? !image.trashedAt : image.trashedAt)
  )
    throw deliveryError('IMAGE_UNAVAILABLE');
  const storage = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, image.storageId))
    .get();
  if (!storage) throw new Error(`Missing image storage: ${image.storageId}`);
  if (!storage.enabled) throw deliveryError('STORAGE_DISABLED');
  const resolved = resolveImageVersion(
    state,
    selectedVersion,
    requireMediaSettings(db).defaultLinkVersion,
  );
  return { image, storage, ...resolved };
}
