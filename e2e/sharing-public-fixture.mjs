import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { createAlbum } from '../src/server/collections/records.ts';
import { albumImages, albums } from '../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../src/server/media/schema.ts';
import { siteSettings } from '../src/server/site/schema.ts';
import { storageConfigs } from '../src/server/storage/schema.ts';
import {
  createShare,
  updateShare,
} from '../src/server/sharing/configuration.ts';
import { albumShares } from '../src/server/sharing/schema.ts';
import { publishSharingImage } from './sharing-public-fixture-images.mjs';
import { launchLocalDelivery } from '../tests/integration/delivery/local-fixture.ts';
import {
  email,
  password as ownerPassword,
} from '../tests/integration/identity/auth-fixture.ts';

/** Disposable production app, real published PNG bytes and real sharing records. */
export async function launchSharingPublic(signal) {
  signal?.throwIfAborted();
  const app = await launchLocalDelivery();
  try {
    signal?.throwIfAborted();
    const port = new URL(app.origin).port;
    const origin = `http://sharing-${port}.localhost:${port}`;
    const [{ file: databasePath }] = app.db.$client.pragma('database_list');
    const dataDirectory = dirname(databasePath);
    app.db
      .update(siteSettings)
      .set({
        publicUrl: origin,
        name: '摄影手记',
        description: '分享生活中的美好瞬间',
      })
      .run();
    const password = 'sharing-public-password';
    const albumRecords = {};
    for (const key of [
      'public',
      'password',
      'rateLimited',
      'empty',
      'disabled',
      'expired',
    ]) {
      albumRecords[key] = app.db.transaction((tx) =>
        createAlbum(tx, {
          name: key === 'public' ? '旅行手记' : `未解锁不可见-${key}`,
          description:
            key === 'public'
              ? '沿途的光与风景。<script>window.__shareInjection=true</script>'
              : `不可泄露的描述-${key}`,
        }),
      );
    }
    const publicIds = [];
    const excludedIds = [];
    const statusIds = {};
    const names = [];
    const now = Date.now();
    for (let index = 0; index < 124; index++) {
      signal?.throwIfAborted();
      const image = await app.seed();
      const name = `共享照片-${String(index + 1).padStart(3, '0')}`;
      publicIds.push(image.imageId);
      names.push(name);
      const thumbnailPath = await publishSharingImage({
        db: app.db,
        dataDirectory,
        storage: app.storage,
        image,
        name,
        index,
        albumId: albumRecords.public.id,
        joinedAt: new Date(now - index * 1000),
      });
      if (index < 6) {
        const status = [
          'pending',
          'processing',
          'failed',
          'disabled',
          'missing',
          'reprocessFailed',
        ][index];
        statusIds[status] = image.imageId;
        if (['pending', 'processing', 'failed'].includes(status)) {
          app.db
            .update(mediaImages)
            .set({ processingStatus: status })
            .where(eq(mediaImages.id, image.imageId))
            .run();
        } else if (status === 'disabled') {
          const storageId = randomUUID();
          app.db
            .insert(storageConfigs)
            .values({
              id: storageId,
              name: '不可泄露停用存储',
              type: 'local',
              enabled: false,
              localPath: 'sharing-disabled',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();
          app.db.transaction(
            (tx) => {
              const objects = tx
                .select()
                .from(mediaObjects)
                .where(eq(mediaObjects.imageId, image.imageId))
                .all();
              const versions = tx
                .select()
                .from(mediaVersions)
                .where(eq(mediaVersions.imageId, image.imageId))
                .all();
              tx.delete(mediaVersions)
                .where(eq(mediaVersions.imageId, image.imageId))
                .run();
              tx.delete(mediaObjects)
                .where(eq(mediaObjects.imageId, image.imageId))
                .run();
              tx.update(mediaImages)
                .set({ storageId })
                .where(eq(mediaImages.id, image.imageId))
                .run();
              tx.insert(mediaObjects)
                .values(objects.map((object) => ({ ...object, storageId })))
                .run();
              tx.insert(mediaVersions).values(versions).run();
            },
            { behavior: 'immediate' },
          );
        } else if (status === 'missing') {
          await rm(thumbnailPath);
        } else if (status === 'reprocessFailed') {
          app.db
            .update(mediaJobs)
            .set({ status: 'failed', error: '不可泄露的处理错误' })
            .where(eq(mediaJobs.imageId, image.imageId))
            .run();
        }
      }
    }
    for (const state of ['private', 'trashed', 'deleting', 'removed']) {
      const image = await app.seed();
      excludedIds.push(image.imageId);
      app.db.transaction((tx) => {
        tx.update(mediaImages)
          .set({
            displayName: `禁止泄露-${state}`,
            ...(state === 'private' ? { visibility: 'private' } : {}),
            ...(state === 'trashed' ? { trashedAt: new Date() } : {}),
            ...(state === 'deleting' ? { deletionStatus: 'deleting' } : {}),
          })
          .where(eq(mediaImages.id, image.imageId))
          .run();
        if (state !== 'removed')
          tx.insert(albumImages)
            .values({
              albumId: albumRecords.public.id,
              imageId: image.imageId,
              joinedAt: new Date(now + 1000),
            })
            .run();
      });
    }
    // Locked albums deliberately contain identifiable data to detect any gate leak.
    for (const key of ['password', 'rateLimited'])
      app.db
        .insert(albumImages)
        .values({
          albumId: albumRecords[key].id,
          imageId: publicIds[6],
          joinedAt: new Date(now),
        })
        .run();
    app.db
      .update(albums)
      .set({ preferredCoverImageId: statusIds.pending })
      .where(eq(albums.id, albumRecords.public.id))
      .run();
    const shares = {};
    for (const key of Object.keys(albumRecords)) {
      shares[key] = await createShare(app.db, albumRecords[key].id, {
        ...(key === 'password' || key === 'rateLimited'
          ? { password: { action: 'set', value: password } }
          : {}),
      });
    }
    await updateShare(app.db, albumRecords.disabled.id, { enabled: false });
    app.db
      .update(albumShares)
      .set({ expiresAt: new Date(now - 1) })
      .where(eq(albumShares.albumId, albumRecords.expired.id))
      .run();
    return {
      browserInput: {
        origin,
        credentials: { email, password: ownerPassword },
        password,
        albums: Object.fromEntries(
          Object.entries(shares).map(([key, share]) => [
            key,
            {
              id: share.albumId,
              token: share.token,
              name: albumRecords[key].name,
              description: albumRecords[key].description,
            },
          ]),
        ),
        publicIds,
        excludedIds,
        statusIds,
        names,
        databasePath,
        dataDirectory,
      },
      async verify() {
        assert.deepEqual(app.db.$client.pragma('foreign_key_check'), []);
      },
      logs: app.logs,
      stop: app.close,
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
