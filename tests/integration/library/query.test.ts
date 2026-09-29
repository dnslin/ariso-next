import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseLibraryQuery,
  LibraryQueryError,
} from '../../../src/server/library/query-schema.ts';
import {
  readLibraryPage,
  readLibraryNeighbors,
  readLibraryStatus,
} from '../../../src/server/library/queries.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import {
  albumImages,
  albums,
  imageTags,
  tags,
} from '../../../src/server/collections/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { createProductionFixture } from '../../experiments/library/production-fixture.ts';

let directory: string;
let connection: ReturnType<typeof createProductionFixture>;
const query = (params = '') => parseLibraryQuery(new URLSearchParams(params));
const read = (params = '') => readLibraryPage(connection.db, query(params));
const ids = (params = '') => read(params).items.map((item) => item.id);
function seed(
  id: string,
  values: Partial<typeof mediaImages.$inferInsert> = {},
) {
  connection.db
    .insert(mediaImages)
    .values({
      id,
      storageId: 'storage-0',
      originalName: `${id}.png`,
      displayName: id,
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 100,
      processingStatus: 'ready',
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
      ...values,
    })
    .run();
}
function album(id: string, joinedAt = 1000) {
  connection.db
    .insert(albumImages)
    .values({ albumId: 'album-0', imageId: id, joinedAt: new Date(joinedAt) })
    .run();
}
function tag(id: string, tagId: string) {
  connection.db.insert(imageTags).values({ imageId: id, tagId }).run();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-production-query-'));
  connection = createProductionFixture(join(directory, 'ariso.db'), 0);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('production library queries', () => {
  it('intersects filter categories, unions tags and names, and never duplicates rows or totals', () => {
    seed('match-both', {
      displayName: 'Travel portrait',
      storageId: 'storage-3',
      visibility: 'public',
      format: 'HEIC',
      createdAt: new Date(2000),
    });
    seed('match-one', {
      originalName: 'TRAVEL.heic',
      storageId: 'storage-3',
      visibility: 'public',
      format: 'HEIC',
      createdAt: new Date(2999),
    });
    seed('wrong-tag', {
      displayName: 'Travel',
      storageId: 'storage-3',
      visibility: 'public',
      format: 'HEIC',
      createdAt: new Date(2500),
    });
    seed('wrong-storage', {
      displayName: 'Travel',
      visibility: 'public',
      format: 'HEIC',
      createdAt: new Date(2500),
    });
    seed('exclusive-end', {
      displayName: 'Travel',
      storageId: 'storage-3',
      visibility: 'public',
      format: 'HEIC',
      createdAt: new Date(3000),
    });
    for (const id of [
      'match-both',
      'match-one',
      'wrong-tag',
      'wrong-storage',
      'exclusive-end',
    ])
      album(id);
    for (const id of ['match-both', 'wrong-storage', 'exclusive-end'])
      tag(id, 'tag-1');
    for (const id of ['match-both', 'match-one']) tag(id, 'tag-2');
    const params = new URLSearchParams({
      q: ' travel ',
      albumId: 'album-0',
      storageId: 'storage-3',
      visibility: 'public',
      format: 'heif',
      status: 'ready',
      uploadedFrom: new Date(2000).toISOString(),
      uploadedBefore: new Date(3000).toISOString(),
    });
    for (const id of ['tag-1', 'tag-2', 'tag-1']) params.append('tagId', id);
    const result = readLibraryPage(connection.db, parseLibraryQuery(params));
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual([
      'match-one',
      'match-both',
    ]);
    expect(result.items.every((item) => !item.storage.enabled)).toBe(true);
  });

  it.each(['%', '_', '\\', '!'])(
    'matches %s literally rather than expanding LIKE patterns',
    (character) => {
      seed('literal', { displayName: `prefix${character}suffix` });
      seed('other', { displayName: 'prefix-anything-suffix' });
      expect(ids(new URLSearchParams({ q: character }).toString())).toEqual([
        'literal',
      ]);
    },
  );

  it('preserves epoch and millisecond date boundaries and excludes unidentified formats only when requested', () => {
    seed('before', { createdAt: new Date(-1), format: '' });
    seed('start', { createdAt: new Date(0), format: '' });
    seed('last', { createdAt: new Date(999) });
    seed('end', { createdAt: new Date(1000) });
    const range = new URLSearchParams({
      uploadedFrom: new Date(0).toISOString(),
      uploadedBefore: new Date(1000).toISOString(),
    });
    expect(ids(range.toString())).toEqual(['last', 'start']);
    range.set('format', 'png');
    expect(ids(range.toString())).toEqual(['last']);
    expect(read().total).toBe(4);
  });

  it.each(['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'])(
    'keeps tied %s results complete across page and cursor boundaries',
    (sort) => {
      for (let i = 0; i < 83; i++) seed(`tie-${String(i).padStart(3, '0')}`);
      seed('low', { createdAt: new Date(0), byteSize: 1 });
      seed('high', { createdAt: new Date(2000), byteSize: 1000 });
      const expected = sort.endsWith('asc')
        ? [
            'low',
            ...Array.from(
              { length: 83 },
              (_, i) => `tie-${String(i).padStart(3, '0')}`,
            ),
            'high',
          ]
        : [
            'high',
            ...Array.from(
              { length: 83 },
              (_, i) => `tie-${String(i).padStart(3, '0')}`,
            ),
            'low',
          ];
      for (const pageSize of [20, 40, 80]) {
        const params = new URLSearchParams({
          sort,
          pageSize: String(pageSize),
        });
        const cursorIds: string[] = [];
        let page = 1;
        do {
          const result = readLibraryPage(
            connection.db,
            parseLibraryQuery(params),
          );
          expect(result.total).toBe(85);
          expect(result.items.map((item) => item.id)).toEqual(
            ids(`sort=${sort}&pageSize=${pageSize}&page=${page}`),
          );
          cursorIds.push(...result.items.map((item) => item.id));
          expect(result.hasMore).toBe(cursorIds.length < 85);
          if (!result.nextCursor) break;
          params.set('cursor', result.nextCursor);
          page++;
        } while (page <= 6);
        expect(cursorIds).toEqual(expected);
      }
      expect(read(`sort=${sort}&page=2000`)).toMatchObject({
        items: [],
        total: 85,
        page: 2000,
        pageSize: 40,
        hasMore: false,
      });
    },
  );

  it('continues from the saved sort value after the cursor anchor is deleted', () => {
    for (let i = 0; i < 45; i++) seed(`tie-${String(i).padStart(3, '0')}`);
    const first = read('pageSize=20');
    const anchor = first.items.at(-1)!;
    connection.db
      .delete(mediaImages)
      .where(eq(mediaImages.id, anchor.id))
      .run();
    const next = read(
      new URLSearchParams({
        pageSize: '20',
        cursor: first.nextCursor!,
      }).toString(),
    );
    expect(next.total).toBe(44);
    expect(next.items.map((item) => item.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `tie-${String(i + 20).padStart(3, '0')}`,
      ),
    );
  });

  it('uses album join order in album scope and requested image order in normal scope', () => {
    seed('uploaded-new', { createdAt: new Date(3000) });
    seed('joined-new-a');
    seed('joined-new-b');
    seed('outside');
    seed('trashed', { trashedAt: new Date(5000) });
    album('uploaded-new', 1000);
    for (const id of ['joined-new-a', 'joined-new-b', 'trashed'])
      album(id, 3000);
    expect(ids('scope=album&albumId=album-0')).toEqual([
      'joined-new-a',
      'joined-new-b',
      'uploaded-new',
    ]);
    expect(ids('albumId=album-0')).toEqual([
      'uploaded-new',
      'joined-new-a',
      'joined-new-b',
    ]);
    expect(ids('scope=album&albumId=album-0&q=joined')).toEqual([
      'joined-new-a',
      'joined-new-b',
    ]);
    expect(
      readLibraryNeighbors(
        connection.db,
        'joined-new-b',
        query('scope=album&albumId=album-0'),
      ),
    ).toMatchObject({
      previous: { id: 'joined-new-a' },
      next: { id: 'uploaded-new' },
    });
  });

  it.each(['album', 'trash'])(
    'keeps fixed %s ordering stable across cursor boundaries',
    (scope) => {
      for (let i = 0; i < 45; i++) {
        const id = `image-${String(i).padStart(3, '0')}`;
        seed(id, scope === 'trash' ? { trashedAt: new Date(1000) } : {});
        if (scope === 'album') album(id, 1000);
      }
      const params = new URLSearchParams({
        scope,
        pageSize: '20',
        ...(scope === 'album' ? { albumId: 'album-0' } : {}),
      });
      const collected: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const result = readLibraryPage(
          connection.db,
          parseLibraryQuery(params),
        );
        expect(result.total).toBe(45);
        collected.push(...result.items.map((item) => item.id));
        if (result.nextCursor) params.set('cursor', result.nextCursor);
        else expect(page).toBe(3);
      }
      expect(collected).toEqual(
        Array.from(
          { length: 45 },
          (_, i) => `image-${String(i).padStart(3, '0')}`,
        ),
      );
    },
  );

  it('keeps NULL trash timestamps out of trash and independently filters deletion and processing states', () => {
    seed('normal');
    seed('trash-old', { trashedAt: new Date(0) });
    seed('trash-new', { trashedAt: new Date(2000) });
    seed('cleanup', {
      trashedAt: new Date(2000),
      deletionStatus: 'cleanup_failed',
      processingStatus: 'failed',
      storageId: 'storage-3',
    });
    seed('deleting', { trashedAt: new Date(2000), deletionStatus: 'deleting' });
    expect(ids()).toEqual(['normal']);
    expect(ids('scope=trash')).toEqual([
      'cleanup',
      'deleting',
      'trash-new',
      'trash-old',
    ]);
    expect(ids('scope=trash&deletionStatus=none')).toEqual([
      'trash-new',
      'trash-old',
    ]);
    expect(
      ids(
        'scope=trash&deletionStatus=cleanup_failed&status=failed&storageId=storage-3&q=cleanup',
      ),
    ).toEqual(['cleanup']);
  });

  it.each([
    'albumId=missing',
    'tagId=tag-1&tagId=missing',
    'storageId=missing',
    'scope=album&albumId=missing',
  ])('returns an explicit error for a missing reference: %s', (params) => {
    seed('must-not-leak');
    expect(() => read(params)).toThrow(LibraryQueryError);
    expect(() => read(params)).toThrow(
      expect.objectContaining({
        status: 409,
        code: 'LIBRARY_STALE_REFERENCE',
      }),
    );
  });

  it('does not retarget a deleted tag or album to a newly created record with the same name', () => {
    seed('record');
    tag('record', 'tag-0');
    album('record');
    connection.db.delete(tags).where(eq(tags.id, 'tag-0')).run();
    connection.db.delete(albums).where(eq(albums.id, 'album-0')).run();
    connection.db
      .insert(tags)
      .values({
        id: 'replacement-tag',
        displayName: 'Tag 0',
        normalizedKey: 'tag 0',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    connection.db
      .insert(albums)
      .values({
        id: 'replacement-album',
        name: 'Album 0',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    expect(() => read('tagId=tag-0')).toThrow(LibraryQueryError);
    expect(() => read('albumId=album-0')).toThrow(LibraryQueryError);
  });

  it.each(['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'])(
    'uses %s primary order and ascending IDs for neighbor boundaries',
    (sort) => {
      seed('low', { createdAt: new Date(0), byteSize: 1 });
      seed('tie-a');
      seed('tie-b');
      seed('high', { createdAt: new Date(2000), byteSize: 1000 });
      const context = query(`sort=${sort}`);
      const first = sort.endsWith('asc') ? 'low' : 'high';
      const last = sort.endsWith('asc') ? 'high' : 'low';
      expect(
        readLibraryNeighbors(connection.db, 'tie-a', context),
      ).toMatchObject({ previous: { id: first }, next: { id: 'tie-b' } });
      expect(
        readLibraryNeighbors(connection.db, 'tie-b', context),
      ).toMatchObject({ previous: { id: 'tie-a' }, next: { id: last } });
      expect(readLibraryNeighbors(connection.db, first, context)).toMatchObject(
        { previous: null, next: { id: 'tie-a' } },
      );
      expect(readLibraryNeighbors(connection.db, last, context)).toMatchObject({
        previous: { id: 'tie-b' },
        next: null,
      });
    },
  );

  it('finds neighbors across pages within the same filtered order, with no wraparound', () => {
    for (let i = 0; i < 45; i++) {
      const id = `image-${String(i).padStart(3, '0')}`;
      seed(id);
      tag(id, 'tag-1');
    }
    seed('unrelated');
    for (const params of [
      'page=2',
      'scope=trash',
      new URLSearchParams({
        pageSize: '20',
        cursor: read('pageSize=20').nextCursor!,
      }).toString(),
    ]) {
      expect(() =>
        readLibraryNeighbors(connection.db, 'image-020', query(params)),
      ).toThrow(
        expect.objectContaining({ status: 400, code: 'LIBRARY_INVALID_QUERY' }),
      );
    }
    const context = query('tagId=tag-1&pageSize=20');
    expect(
      readLibraryNeighbors(connection.db, 'image-020', context),
    ).toMatchObject({
      previous: { id: 'image-019' },
      next: { id: 'image-021' },
    });
    expect(
      readLibraryNeighbors(connection.db, 'image-000', context),
    ).toMatchObject({ previous: null, next: { id: 'image-001' } });
    expect(
      readLibraryNeighbors(connection.db, 'image-044', context),
    ).toMatchObject({ previous: { id: 'image-043' }, next: null });
    expect(() =>
      readLibraryNeighbors(connection.db, 'unrelated', context),
    ).toThrow(LibraryQueryError);
    expect(() =>
      readLibraryNeighbors(connection.db, 'missing', context),
    ).toThrow(LibraryQueryError);
  });

  it('enforces bounded status batches and preserves requested order after deduplication', () => {
    for (let i = 0; i < 81; i++) seed(`image-${i}`);
    const requested = Array.from({ length: 80 }, (_, i) => `image-${79 - i}`);
    expect(
      readLibraryStatus(connection.db, { ids: requested }).items.map(
        (item) => item.id,
      ),
    ).toEqual(requested);
    expect(
      readLibraryStatus(connection.db, {
        ids: ['image-2', 'image-1', 'image-2'],
      }).items.map((item) => item.id),
    ).toEqual(['image-2', 'image-1']);
    for (const invalid of [
      { ids: [] },
      { ids: [...requested, 'image-80'] },
      { ids: [''] },
      { ids: ['image-1'], extra: true },
    ])
      expect(() => readLibraryStatus(connection.db, invalid)).toThrow(
        LibraryQueryError,
      );
  });

  it('batches current facts including trash and missing IDs without confusing reprocessing failures with image status', () => {
    seed('ready');
    seed('trashed', {
      trashedAt: new Date(2000),
      deletionStatus: 'cleanup_failed',
    });
    const snapshot = connection.db.transaction((tx) =>
      createProcessingSnapshot(tx),
    );
    connection.db
      .insert(mediaJobs)
      .values([
        {
          id: 'older',
          imageId: 'ready',
          kind: 'process',
          scope: 'all',
          snapshot,
          expectedVersions: ['thumbnail'],
          status: 'failed',
          error: 'old',
          createdAt: new Date(1000),
          updatedAt: new Date(1000),
        },
        {
          id: 'latest',
          imageId: 'ready',
          kind: 'process',
          scope: 'thumbnail',
          snapshot,
          expectedVersions: ['thumbnail'],
          status: 'failed',
          error: 'latest failure',
          createdAt: new Date(2000),
          updatedAt: new Date(2000),
        },
        {
          id: 'active',
          imageId: 'ready',
          kind: 'process',
          scope: 'thumbnail',
          snapshot,
          expectedVersions: ['thumbnail'],
          status: 'running',
          createdAt: new Date(3000),
          updatedAt: new Date(3000),
        },
      ])
      .run();
    connection.db
      .insert(mediaObjects)
      .values({
        id: 'thumb',
        imageId: 'ready',
        storageId: 'storage-0',
        key: 'private-key/thumb',
        purpose: 'thumbnail',
        status: 'stored',
        byteSize: 10,
        format: 'WEBP',
        mime: 'image/webp',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    connection.db
      .insert(mediaVersions)
      .values({
        imageId: 'ready',
        kind: 'thumbnail',
        objectId: 'thumb',
        byteSize: 10,
        format: 'WEBP',
        mime: 'image/webp',
        createdAt: new Date(),
      })
      .run();
    const result = readLibraryStatus(connection.db, {
      ids: ['ready', 'trashed', 'missing'],
    });
    expect(result.missingIds).toEqual(['missing']);
    expect(result.items.find((item) => item.id === 'ready')).toMatchObject({
      processingStatus: 'ready',
      activeJob: { id: 'active' },
      latestFailedJob: { id: 'latest', error: 'latest failure' },
      versions: { thumbnail: true },
      thumbnailUrl: '/i/ready?type=thumbnail',
    });
    expect(result.items.find((item) => item.id === 'trashed')).toMatchObject({
      trashedAt: new Date(2000).toISOString(),
      deletionStatus: 'cleanup_failed',
    });
    expect(read('status=failed').total).toBe(0);
    expect(JSON.stringify(result)).not.toContain('private-key');
    connection.db
      .update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, 'storage-0'))
      .run();
    expect(
      readLibraryStatus(connection.db, { ids: ['ready'] }).items[0],
    ).toMatchObject({
      processingStatus: 'ready',
      storage: { enabled: false },
      thumbnailUrl: null,
    });
  });
});
