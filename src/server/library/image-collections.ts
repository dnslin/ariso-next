import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  addMemberships,
  removeMemberships,
} from '../collections/memberships.ts';
import { readLibraryDetail } from './detail.ts';

export const imageCollectionsSchema = z
  .strictObject({
    albumIds: z.array(z.string().min(1)).optional(),
    tagIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (value) => value.albumIds !== undefined || value.tagIds !== undefined,
    {
      message: '至少提供相册或标签集合',
    },
  );

/** Keep surviving joins intact; provider calls run as savepoints in one outer transaction. */
export function updateImageCollections(
  db: BetterSQLite3Database,
  imageId: string,
  input: unknown,
) {
  const patch = imageCollectionsSchema.parse(input);
  return db.transaction(
    (tx) => {
      const current = readLibraryDetail(tx, imageId);
      const currentAlbums = current.albums.map((album) => album.id);
      const currentTags = current.tags.map((tag) => tag.id);
      const selection = {
        albumIds: patch.albumIds ?? currentAlbums,
        tagIds: patch.tagIds ?? currentTags,
      };
      // Providers recheck actual targets and asset lifecycle; propagate their original cause.
      const added = addMemberships(tx, [imageId], selection)[0];
      if (added.status === 'error') throw added.cause;
      const removed = removeMemberships(tx, [imageId], {
        albumIds: currentAlbums.filter(
          (id) => !selection.albumIds.includes(id),
        ),
        tagIds: currentTags.filter((id) => !selection.tagIds.includes(id)),
      })[0];
      if (removed.status === 'error') throw removed.cause;
      return readLibraryDetail(tx, imageId);
    },
    { behavior: 'immediate' },
  );
}
