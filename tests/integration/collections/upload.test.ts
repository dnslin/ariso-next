import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAlbum,
  deleteAlbum,
  deleteTag,
} from '../../../src/server/collections/records.ts';
import {
  prepareUploadSelection,
  attachAcceptedImage,
} from '../../../src/server/collections/memberships.ts';
import {
  albums,
  albumImages,
  tags,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
  mediaJobs,
} from '../../../src/server/media/schema.ts';
import {
  planLocalWrite,
  writeObject,
  readObject,
} from '../../../src/server/storage/local.ts';
import { collectionFixture } from './helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  fixture.close();
});

describe('T-COL-01 synchronous upload handoff', () => {
  it('retains committed empty records but rolls back all records from a failed preparation', () => {
    const { db } = fixture;
    const album = db.transaction((tx) => createAlbum(tx, { name: '旅行' }));
    const selection = db.transaction(
      (tx) =>
        prepareUploadSelection(tx, {
          albumIds: [album.id],
          tagNames: ['Go', 'GO'],
        }),
      { behavior: 'immediate' },
    );
    expect(selection.tagIds).toHaveLength(1);
    expect(() =>
      db.transaction((tx) => {
        prepareUploadSelection(tx, { tagNames: ['new'] });
        throw new Error('later preparation failure');
      }),
    ).toThrow('later preparation failure');
    expect(() =>
      db.transaction((tx) =>
        prepareUploadSelection(tx, {
          albumIds: ['missing'],
          tagNames: ['do not create'],
        }),
      ),
    ).toThrow();
    expect(() =>
      db.transaction((tx) =>
        prepareUploadSelection(tx, { tagNames: ['valid', '\ninvalid'] }),
      ),
    ).toThrow();
    expect(
      db
        .select()
        .from(tags)
        .all()
        .map((r) => r.displayName),
    ).toEqual(['Go']);
    expect(db.select().from(albums).all()).toHaveLength(1);
    expect(db.select().from(albumImages).all()).toEqual([]);
    expect(db.select().from(imageTags).all()).toEqual([]);
  });

  it.each(['album', 'tag'] as const)(
    'rolls back the whole accepted asset when a fixed %s ID was deleted, without rebinding names',
    async (target) => {
      const { db, storage, storageRoot } = fixture;
      const album = db.transaction((tx) => createAlbum(tx, { name: '旅行' }));
      const selection = db.transaction(
        (tx) =>
          prepareUploadSelection(tx, {
            albumIds: [album.id],
            tagNames: ['Go', 'keep'],
          }),
        { behavior: 'immediate' },
      );
      const successful = fixture.input();
      db.transaction((tx) => {
        acceptOriginal(tx, successful);
        attachAcceptedImage(tx, successful.imageId, selection);
      });
      db.transaction((tx) => {
        if (target === 'album') {
          deleteAlbum(tx, album.id);
          createAlbum(tx, { name: '旅行' });
        } else {
          deleteTag(tx, selection.tagIds[0]);
          prepareUploadSelection(tx, { tagNames: ['GO'] });
        }
      });
      const bytes = readFileSync(
        resolve('tests/fixtures/runtime/images/sample.png'),
      );
      const write = planLocalWrite('uploads');
      await writeObject(storageRoot, storage, write, Readable.from(bytes));
      const pending = {
        ...fixture.input(),
        key: write.key,
        byteSize: bytes.length,
      };
      // Test owner is deliberately not the future upload module. It proves transaction
      // rollback and real byte responsibility, not T-UP-01 HTTP/session completion.
      db.$client.exec('CREATE TABLE test_upload_owner (key TEXT PRIMARY KEY)');
      db.$client
        .prepare('INSERT INTO test_upload_owner VALUES (?)')
        .run(write.key);
      expect(() =>
        db.transaction((tx) => {
          acceptOriginal(tx, pending);
          attachAcceptedImage(tx, pending.imageId, selection);
          db.$client
            .prepare('DELETE FROM test_upload_owner WHERE key = ?')
            .run(write.key);
        }),
      ).toThrow(expect.objectContaining({ code: 'COLLECTION_TARGET_REMOVED' }));
      for (const table of [
        mediaImages,
        mediaObjects,
        mediaVersions,
        mediaJobs,
      ] as const) {
        expect(db.select().from(table).all()).toHaveLength(1);
      }
      expect(
        db
          .select()
          .from(albumImages)
          .where(eq(albumImages.imageId, pending.imageId))
          .all(),
      ).toEqual([]);
      expect(
        db
          .select()
          .from(imageTags)
          .where(eq(imageTags.imageId, pending.imageId))
          .all(),
      ).toEqual([]);
      expect(
        db.$client.prepare('SELECT key FROM test_upload_owner').all(),
      ).toEqual([{ key: write.key }]);
      const original = await readObject(
        storageRoot,
        storage,
        write.key,
        'image/png',
      );
      const chunks = [];
      for await (const chunk of original.stream)
        chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(bytes);
      expect(db.select().from(mediaImages).get()!.id).toBe(successful.imageId);
    },
  );

  it('rolls back relations and media after a later caller error, then accepts into every fixed target', () => {
    const { db } = fixture;
    const selection = db.transaction((tx) => {
      const first = createAlbum(tx, { name: 'same' });
      const second = createAlbum(tx, { name: 'same' });
      return prepareUploadSelection(tx, {
        albumIds: [first.id, second.id],
        tagNames: ['Go', '旅行'],
      });
    });
    const input = fixture.input();
    expect(() =>
      db.transaction((tx) => {
        acceptOriginal(tx, input);
        attachAcceptedImage(tx, input.imageId, selection);
        throw new Error('caller completion failed');
      }),
    ).toThrow('caller completion failed');
    for (const table of [
      mediaImages,
      mediaObjects,
      mediaVersions,
      mediaJobs,
      albumImages,
      imageTags,
    ] as const)
      expect(db.select().from(table).all()).toEqual([]);
    db.transaction((tx) => {
      acceptOriginal(tx, input);
      attachAcceptedImage(tx, input.imageId, selection);
    });
    expect(
      db
        .select()
        .from(albumImages)
        .all()
        .map((r) => r.albumId)
        .sort(),
    ).toEqual([...selection.albumIds].sort());
    expect(
      db
        .select()
        .from(imageTags)
        .all()
        .map((r) => r.tagId)
        .sort(),
    ).toEqual([...selection.tagIds].sort());
    expect(db.select().from(mediaObjects).all()).toHaveLength(1);
    db.update(mediaImages)
      .set({ processingStatus: 'failed' })
      .where(eq(mediaImages.id, input.imageId))
      .run();
    expect(db.select().from(albumImages).all()).toHaveLength(2);
    expect(db.select().from(imageTags).all()).toHaveLength(2);
  });
});
