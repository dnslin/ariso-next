import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getImageAccessState } from '../media/images.ts';
import type { VersionKind } from '../media/schema.ts';
import { requireMediaSettings } from '../media/settings.ts';
import { storageConfigs } from '../storage/schema.ts';
import { deliveryError } from './errors.ts';
import { resolveImageVersion } from './links.ts';
import { mediaObjects } from '../media/schema.ts';
import { mediaSizeVersions } from '../media/size-schema.ts';
import type { SizePreset } from '../media/size-types.ts';

/** Read after each asynchronous identity/I/O interval; never hold a transaction over I/O. */
export function selectImageDelivery(
  db: BetterSQLite3Database,
  imageId: string,
  selectedVersion: VersionKind | undefined,
  owner: boolean,
  access: 'published' | 'trash-preview' = 'published',
  preset?: SizePreset,
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
  if (preset) {
    if (
      (selectedVersion !== 'compressed' && selectedVersion !== 'watermark') ||
      access !== 'published'
    )
      throw deliveryError('INVALID_IMAGE_REQUEST');
    const sized = db
      .select({ size: mediaSizeVersions, object: mediaObjects })
      .from(mediaSizeVersions)
      .innerJoin(mediaObjects, eq(mediaObjects.id, mediaSizeVersions.objectId))
      .where(
        and(
          eq(mediaSizeVersions.imageId, imageId),
          eq(mediaSizeVersions.sourceVersion, selectedVersion),
          eq(mediaSizeVersions.preset, preset),
          eq(mediaSizeVersions.sourceObjectId, resolved.object.id),
          eq(mediaObjects.status, 'stored'),
        ),
      )
      .get();
    if (!sized) throw deliveryError('VERSION_UNAVAILABLE');
    return {
      image,
      storage,
      actualVersion: selectedVersion,
      object: sized.object,
      version: {
        ...resolved.version,
        objectId: sized.object.id,
        width: sized.object.width,
        height: sized.object.height,
        byteSize: sized.object.byteSize!,
        format: sized.object.format!,
        mime: sized.object.mime!,
        createdAt: sized.size.createdAt,
      },
    };
  }
  return { image, storage, ...resolved };
}
