import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createSqliteFixture,
  epoch,
  fixtureImage,
  installCandidateIndexes,
} from '../../experiments/library/sqlite-fixture.ts';
import {
  executeQuery,
  type Query,
  type Sort,
} from '../../experiments/library/sqlite-query.ts';

const directory = mkdtempSync(join(tmpdir(), 'ariso-library-test-'));
const connection = createSqliteFixture(join(directory, 'library.db'), 2400);
const db = connection.db.$client;
const rows = Array.from({ length: 2400 }, (_, i) => fixtureImage(i));
beforeAll(() => installCandidateIndexes(db));
afterAll(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

function allPages(query: Query) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const result = executeQuery(db, query, { cursor });
    ids.push(...result.items.map((item) => item.id));
    cursor = result.nextCursor ?? undefined;
  } while (cursor);
  return ids;
}

it.each<Sort>(['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'])(
  'cursor %s preserves all IDs across equal sort values and matches deep offset pages',
  (sort) => {
    const descending = sort.endsWith('desc');
    const expected = rows
      .filter((row) => row.trashedAt === null)
      .sort((a, b) => {
        const primary = sort.startsWith('size')
          ? a.byteSize - b.byteSize
          : a.createdAt - b.createdAt;
        return (descending ? -primary : primary) || a.id.localeCompare(b.id);
      })
      .map((row) => row.id);
    const actual = allPages({ sort, pageSize: 20 });
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(expected.length);
    const deep = executeQuery(db, { sort, pageSize: 20 }, { page: 80 });
    expect(deep.items.map((item) => item.id)).toEqual(
      expected.slice(1580, 1600),
    );
    expect(deep.total).toBe(expected.length);
  },
);

it('combines album and any selected tag using EXISTS without duplicate items or inflated total', () => {
  const tagIds = ['tag-1', 'tag-14', 'tag-27'];
  const expected = rows
    .filter(
      (row) =>
        row.trashedAt === null &&
        row.albumIds.includes('album-1') &&
        row.tagIds.some((tag) => tagIds.includes(tag)),
    )
    .map((row) => row.id)
    .sort();
  const query = { albumId: 'album-1', tagIds };
  expect(allPages(query).sort()).toEqual(expected);
  expect(executeQuery(db, query).total).toBe(expected.length);
  const tagged = rows.filter(
    (row) =>
      row.trashedAt === null && row.tagIds.some((tag) => tagIds.includes(tag)),
  );
  expect(
    tagged.some(
      (row) => row.tagIds.filter((tag) => tagIds.includes(tag)).length > 1,
    ),
  ).toBe(true);
  expect(allPages({ tagIds }).sort()).toEqual(
    tagged.map((row) => row.id).sort(),
  );
});

it('keeps private and failed assets in disabled storage and combines UTC and status filters', () => {
  const query: Query = {
    storageId: 'storage-3',
    status: 'failed',
    visibility: 'private',
    format: 'avif',
    uploadedFrom: epoch + 10000,
    uploadedBefore: epoch + 200000,
  };
  const expected = rows.filter(
    (row) =>
      row.trashedAt === null &&
      row.storageId === query.storageId &&
      row.status === query.status &&
      row.visibility === query.visibility &&
      row.format === query.format &&
      row.createdAt >= query.uploadedFrom! &&
      row.createdAt < query.uploadedBefore!,
  );
  expect(expected.length).toBeGreaterThan(0);
  expect(allPages(query).sort()).toEqual(expected.map((row) => row.id).sort());
  expect(executeQuery(db, query).items.every((row) => row.enabled === 0)).toBe(
    true,
  );
  const boundary = executeQuery(db, {
    uploadedFrom: epoch + 1000,
    uploadedBefore: epoch + 2000,
  });
  expect(boundary.items.map((item) => item.id)).toEqual(
    rows.slice(8, 16).map((row) => row.id),
  );
});

it('search is literal whole substring across both name fields with ASCII-only folding', () => {
  const cases = [
    '  100%_真实  ',
    'archive_',
    'Photo 2',
    '%',
    '_',
    "' OR 1=1 --",
    '\\',
    'É',
    'é',
  ];
  db.prepare('UPDATE media_images SET display_name = ? WHERE id = ?').run(
    'Éléphant\\100%_mark',
    'image-000001',
  );
  const source = rows.map((row) =>
    row.id === 'image-000001'
      ? { ...row, displayName: 'Éléphant\\100%_mark' }
      : row,
  );
  const fold = (value: string) =>
    value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  try {
    for (const q of cases) {
      const expected = source
        .filter(
          (row) =>
            row.trashedAt === null &&
            [row.displayName, row.originalName].some((name) =>
              fold(name).includes(fold(q.trim())),
            ),
        )
        .map((row) => row.id)
        .sort();
      expect(allPages({ q }).sort(), q).toEqual(expected);
    }
  } finally {
    db.prepare('UPDATE media_images SET display_name = ? WHERE id = ?').run(
      rows[1].displayName,
      rows[1].id,
    );
  }
});

it('binds the cursor to normalized filters, scope and ordering but preserves it after the boundary row is removed', () => {
  const first = executeQuery(db, {
    q: ' Photo ',
    tagIds: ['tag-1', 'tag-2', 'tag-1'],
    pageSize: 20,
  });
  expect(first.nextCursor).not.toBeNull();
  const cursor = first.nextCursor!;
  expect(() =>
    executeQuery(
      db,
      { tagIds: ['tag-2', 'tag-1'], q: 'Photo', pageSize: 20 },
      { cursor },
    ),
  ).not.toThrow();
  for (const changed of [
    { q: 'Archive' },
    { scope: 'trash' as const },
    { scope: 'album' as const, albumId: 'album-1' },
    { sort: 'size_asc' as const },
    { pageSize: 80 as const },
  ]) {
    expect(() =>
      executeQuery(
        db,
        { q: 'Photo', tagIds: ['tag-1', 'tag-2'], pageSize: 20, ...changed },
        { cursor },
      ),
    ).toThrow('Cursor does not belong');
  }
  expect(() =>
    executeQuery(db, {}, { cursor: Buffer.from('{}').toString('base64url') }),
  ).toThrow();
  const query: Query = { sort: 'uploaded_desc', pageSize: 20 };
  const before = executeQuery(db, query);
  const following = executeQuery(db, query, { cursor: before.nextCursor! });
  const last = before.items.at(-1)!;
  db.prepare('UPDATE media_images SET trashed_at = ? WHERE id = ?').run(
    epoch,
    last.id,
  );
  try {
    expect(
      executeQuery(db, query, { cursor: before.nextCursor! }).items,
    ).toEqual(following.items);
  } finally {
    db.prepare('UPDATE media_images SET trashed_at = NULL WHERE id = ?').run(
      last.id,
    );
  }
});

it('album and trash use their fixed order, and pages beyond the end retain the real total', () => {
  const albumExpected = rows
    .map((row, i) => ({ ...row, addedAt: epoch + Math.floor(i / 11) * 1000 }))
    .filter((row) => row.trashedAt === null && row.albumIds.includes('album-0'))
    .sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id))
    .map((row) => row.id);
  expect(
    allPages({ scope: 'album', albumId: 'album-0', pageSize: 20 }),
  ).toEqual(albumExpected);
  const trash = rows
    .filter((row) => row.trashedAt !== null)
    .sort((a, b) => b.trashedAt! - a.trashedAt! || a.id.localeCompare(b.id))
    .map((row) => row.id);
  expect(allPages({ scope: 'trash', pageSize: 20 })).toEqual(trash);
  expect(() =>
    executeQuery(db, { scope: 'album', albumId: 'album-0', sort: 'size_asc' }),
  ).toThrow('fixed ordering');
  expect(executeQuery(db, {}, { page: 1000 })).toMatchObject({
    items: [],
    total: 2280,
    hasMore: false,
    nextCursor: null,
  });
});
