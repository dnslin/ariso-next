import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { resolveLocalUploadStorage } from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import { launchProtocolDelivery } from './s3-fixture.ts';

/** Real standalone + local SDK protocol service; no real-cloud compatibility claim. */
export async function launchAccessProtectionFixture(
  runtimeEnv: Record<string, string | undefined> = {},
) {
  const app = await launchProtocolDelivery({
    ARISO_TRUSTED_PROXIES: 'none',
    ...runtimeEnv,
  });
  const local = resolveLocalUploadStorage(app.db);
  const imageBytes = await readFile(
    resolve('tests/fixtures/runtime/images/sample.png'),
  );
  async function seedLocal(index: number, thumbnail = false) {
    const plan = planLocalWrite('uploads');
    await writeObject(
      join(app.directory, 'data', 'storage'),
      local,
      plan,
      Readable.from(imageBytes),
    );
    const imageId = randomUUID();
    const accepted = app.db.transaction(
      (tx) => {
        const accepted = acceptOriginal(tx, {
          imageId,
          storageId: local.id,
          key: plan.key,
          originalName: `local-${index}.png`,
          visibility: index % 2 === 0 ? 'public' : 'private',
          format: 'PNG',
          mime: 'image/png',
          byteSize: imageBytes.length,
          classification: 'static',
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: [],
        });
        tx.update(mediaJobs)
          .set({ status: 'succeeded' })
          .where(eq(mediaJobs.id, accepted.jobId))
          .run();
        tx.update(mediaImages)
          .set({ processingStatus: 'ready', displayName: `local-${index}` })
          .where(eq(mediaImages.id, imageId))
          .run();
        return accepted;
      },
      { behavior: 'immediate' },
    );
    if (thumbnail) {
      const objectId = randomUUID();
      const thumbnailPlan = planLocalWrite('thumbnails');
      const now = new Date();
      // Register ownership before publishing fixture bytes into the scanned namespace.
      app.db
        .insert(mediaObjects)
        .values({
          id: objectId,
          imageId,
          storageId: local.id,
          key: thumbnailPlan.key,
          purpose: 'thumbnail',
          status: 'stored',
          byteSize: imageBytes.length,
          format: 'PNG',
          mime: 'image/png',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      await writeObject(
        join(app.directory, 'data', 'storage'),
        local,
        thumbnailPlan,
        Readable.from(imageBytes),
      );
      app.db.transaction(
        (tx) => {
          const original = tx
            .select()
            .from(mediaVersions)
            .where(eq(mediaVersions.objectId, accepted.objectId))
            .get()!;
          tx.insert(mediaVersions)
            .values({ ...original, kind: 'thumbnail', objectId })
            .run();
        },
        { behavior: 'immediate' },
      );
    }
    return { imageId, bytes: imageBytes };
  }
  return { ...app, seedLocal };
}
