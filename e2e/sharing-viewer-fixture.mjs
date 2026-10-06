import { randomUUID } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../src/server/media/schema.ts';
import { openRuntimeDatabase } from '../src/server/runtime/db.ts';
import { storageConfigs } from '../src/server/storage/schema.ts';
import { launchSharingPublic } from './sharing-public-fixture.mjs';

/** Extend only the disposable public fixture with genuine published format bytes. */
export async function launchSharingViewer(signal) {
  const fixture = await launchSharingPublic(signal);
  const connection = openRuntimeDatabase(fixture.browserInput.databasePath);
  try {
    const { db } = connection;
    const input = fixture.browserInput;
    const formats = [
      { key: 'compressed', index: 6, kind: 'compressed' },
      {
        key: 'animation',
        index: 7,
        file: 'animated.gif',
        format: 'GIF',
        mime: 'image/gif',
        classification: 'animated',
        kind: 'original',
      },
      {
        key: 'svg',
        index: 8,
        file: 'static.svg',
        format: 'SVG',
        mime: 'image/svg+xml',
        classification: 'preview_only',
        kind: 'thumbnail',
      },
      {
        key: 'ico',
        index: 9,
        file: 'multiple.ico',
        format: 'ICO',
        mime: 'image/x-icon',
        classification: 'preview_only',
        kind: 'thumbnail',
      },
      {
        key: 'multipage',
        index: 10,
        file: 'multiple.tiff',
        format: 'TIFF',
        mime: 'image/tiff',
        classification: 'preview_only',
        kind: 'thumbnail',
      },
    ];
    const viewerFormats = {};
    for (const format of formats) {
      signal?.throwIfAborted();
      const imageId = input.publicIds[format.index];
      const original = db
        .select()
        .from(mediaVersions)
        .where(
          and(
            eq(mediaVersions.imageId, imageId),
            eq(mediaVersions.kind, 'original'),
          ),
        )
        .get();
      const object = db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, original.objectId))
        .get();
      const storage = db
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, object.storageId))
        .get();
      const objectPath = (key) =>
        join(
          input.dataDirectory,
          'storage',
          storage.localPath,
          'ariso',
          storage.id,
          key,
        );
      if (format.file) {
        const bytes = await readFile(
          resolve('tests/fixtures/media-formats', format.file),
        );
        await writeFile(objectPath(object.key), bytes);
        db.transaction(
          (tx) => {
            tx.update(mediaImages)
              .set({
                format: format.format,
                mime: format.mime,
                classification: format.classification,
                animated: format.classification === 'animated',
                byteSize: bytes.length,
              })
              .where(eq(mediaImages.id, imageId))
              .run();
            tx.update(mediaObjects)
              .set({
                format: format.format,
                mime: format.mime,
                byteSize: bytes.length,
              })
              .where(eq(mediaObjects.id, object.id))
              .run();
            tx.update(mediaVersions)
              .set({
                format: format.format,
                mime: format.mime,
                byteSize: bytes.length,
              })
              .where(
                and(
                  eq(mediaVersions.imageId, imageId),
                  eq(mediaVersions.kind, 'original'),
                ),
              )
              .run();
          },
          { behavior: 'immediate' },
        );
      } else {
        const id = randomUUID();
        const key = `sharing-public/${imageId}-compressed.png`;
        db.insert(mediaObjects)
          .values({ ...object, id, key, purpose: 'compressed' })
          .run();
        await copyFile(objectPath(object.key), objectPath(key));
        db.insert(mediaVersions)
          .values({ ...original, kind: 'compressed', objectId: id })
          .run();
      }
      viewerFormats[format.key] = { imageId, kind: format.kind };
    }
    return { ...fixture, browserInput: { ...input, viewerFormats } };
  } catch (error) {
    await fixture.stop();
    throw error;
  } finally {
    connection.close();
  }
}
