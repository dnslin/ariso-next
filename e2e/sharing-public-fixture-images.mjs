import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { albumImages } from '../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../src/server/media/schema.ts';

/** Publish real bytes for one disposable sharing fixture member. */
export async function publishSharingImage({
  db,
  dataDirectory,
  storage,
  image,
  name,
  index,
  albumId,
  joinedAt,
}) {
  const source = db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.imageId, image.imageId))
    .get();
  const version = db
    .select()
    .from(mediaVersions)
    .where(eq(mediaVersions.imageId, image.imageId))
    .get();
  const thumbnailKey = `sharing-public/${image.imageId}.png`;
  const thumbnailPath = join(
    dataDirectory,
    'storage',
    storage.localPath,
    'ariso',
    storage.id,
    thumbnailKey,
  );
  // Exact-key ownership must exist before bytes enter the scanned namespace.
  const objectId = randomUUID();
  db.insert(mediaObjects)
    .values({
      ...source,
      id: objectId,
      purpose: 'thumbnail',
      key: thumbnailKey,
    })
    .run();

  await mkdir(dirname(thumbnailPath), { recursive: true });
  await copyFile(image.path, thumbnailPath);
  db.transaction((tx) => {
    tx.update(mediaImages)
      .set({
        displayName: name,
        originalName: `禁止泄露原名-${index}.png`,
        width: 640,
        height: index % 3 === 0 ? 800 : 480,
      })
      .where(eq(mediaImages.id, image.imageId))
      .run();
    tx.insert(mediaVersions)
      .values({
        ...version,
        kind: 'thumbnail',
        objectId,
        width: 640,
        height: index % 3 === 0 ? 800 : 480,
      })
      .run();
    tx.insert(albumImages)
      .values({
        albumId,
        imageId: image.imageId,
        joinedAt,
      })
      .run();
  });
  return thumbnailPath;
}
