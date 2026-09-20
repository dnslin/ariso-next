import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  versionKinds,
  type DerivedVersionKind,
} from './schema.ts';
import type { ProcessingSnapshot } from './validation.ts';

export type MediaTransaction = Parameters<
  Parameters<BetterSQLite3Database['transaction']>[0]
>[0];
type Image = typeof mediaImages.$inferSelect;
export type AcceptOriginalInput = Pick<
  Image,
  'storageId' | 'originalName' | 'visibility' | 'format' | 'mime' | 'byteSize'
> &
  Partial<
    Pick<
      Image,
      'width' | 'height' | 'animated' | 'pageCount' | 'classification'
    >
  > & {
    imageId: string;
    key: string;
    snapshot: ProcessingSnapshot;
    expectedVersions: DerivedVersionKind[];
  };

/** Called inside the upload owner's synchronous transaction, after its session check.
 * No I/O: the caller retains file responsibility until the outer transaction commits.
 * A fresh upload has a fresh imageId; session completion retries are owned by upload.
 */
export function acceptOriginal(
  tx: MediaTransaction,
  input: AcceptOriginalInput,
) {
  const now = new Date();
  const dot = input.originalName.lastIndexOf('.');
  const displayName =
    (dot > 0 ? input.originalName.slice(0, dot) : input.originalName) ||
    'image';
  tx.insert(mediaImages)
    .values({
      id: input.imageId,
      storageId: input.storageId,
      originalName: input.originalName,
      displayName,
      visibility: input.visibility,
      format: input.format,
      mime: input.mime,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      animated: input.animated,
      pageCount: input.pageCount,
      classification: input.classification,
      processingStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const objectId = randomUUID();
  tx.insert(mediaObjects)
    .values({
      id: objectId,
      imageId: input.imageId,
      storageId: input.storageId,
      key: input.key,
      purpose: 'original',
      status: 'stored',
      byteSize: input.byteSize,
      format: input.format,
      mime: input.mime,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  tx.insert(mediaVersions)
    .values({
      imageId: input.imageId,
      kind: 'original',
      objectId,
      width: input.width,
      height: input.height,
      byteSize: input.byteSize,
      format: input.format,
      mime: input.mime,
      createdAt: now,
    })
    .run();
  const jobId = randomUUID();
  tx.insert(mediaJobs)
    .values({
      id: jobId,
      imageId: input.imageId,
      kind: 'process',
      scope: 'all',
      snapshot: input.snapshot,
      expectedVersions: input.expectedVersions,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { imageId: input.imageId, objectId, jobId };
}

/** Asset facts only. Delivery owns authorization, storage availability and HTTP. */
export function getImageAccessState(
  db: BetterSQLite3Database,
  imageId: string,
) {
  return db.transaction((tx) => {
    const image = tx
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, imageId))
      .get();
    if (!image) return null;
    const saved = tx
      .select({ version: mediaVersions, object: mediaObjects })
      .from(mediaVersions)
      .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
      .where(
        and(
          eq(mediaVersions.imageId, imageId),
          eq(mediaObjects.status, 'stored'),
        ),
      )
      .all();
    const latestJob =
      tx
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.imageId, imageId))
        // SQLite insertion order resolves jobs submitted within the same millisecond.
        .orderBy(desc(mediaJobs.createdAt), desc(sql`${mediaJobs}.rowid`))
        .get() ?? null;
    const versions = versionKinds.map((kind) => ({
      kind,
      applicable:
        kind === 'original' || kind === 'thumbnail'
          ? true
          : image.classification === null
            ? null
            : image.classification === 'static',
      saved: saved.find((row) => row.version.kind === kind) ?? null,
    }));
    return { image, versions, latestJob };
  });
}
