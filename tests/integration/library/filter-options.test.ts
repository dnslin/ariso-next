import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readLibraryFilterOptions } from '../../../src/server/library/filter-options.ts';
import { tags, albums } from '../../../src/server/collections/schema.ts';
import { createProductionFixture } from '../../experiments/library/production-fixture.ts';

let directory: string;
let connection: ReturnType<typeof createProductionFixture>;
const read = (params: string) =>
  readLibraryFilterOptions(connection.db, new URLSearchParams(params));
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-filter-options-'));
  connection = createProductionFixture(join(directory, 'ariso.db'), 0);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('paginates real choices and resolves selected IDs independently of the search and page', () => {
  const first = read('kind=tags');
  const second = read('kind=tags&page=2');
  expect(first.items).toHaveLength(40);
  expect(first.hasMore).toBe(true);
  expect(second.items).toHaveLength(40);
  expect(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
  ).toBe(80);
  const selected = read(
    'kind=tags&q=no-match&selectedId=tag-127&selectedId=deleted&selectedId=deleted',
  );
  expect(selected.items).toEqual([]);
  expect(selected.selected).toEqual([{ id: 'tag-127', name: 'Tag 127' }]);
  expect(selected.missingIds).toEqual(['deleted']);
  connection.db.delete(tags).where(eq(tags.id, 'tag-127')).run();
  expect(read('kind=tags&selectedId=tag-127').missingIds).toEqual(['tag-127']);
});

it('matches literal text and keeps identically named albums as distinct IDs', () => {
  connection.db
    .update(albums)
    .set({ name: '旅行 100%_真实' })
    .where(eq(albums.id, 'album-0'))
    .run();
  connection.db
    .update(albums)
    .set({ name: '旅行 100%_真实' })
    .where(eq(albums.id, 'album-1'))
    .run();
  expect(read('kind=albums&q=%25_').items.map((item) => item.id)).toEqual([
    'album-0',
    'album-1',
  ]);
  expect(read('kind=albums&q=ALBUM 2').items.length).toBeGreaterThan(0);
});

it('includes disabled storages without paths, credentials, or operational configuration', () => {
  expect(read('kind=storages').items).toEqual([
    { id: 'storage-0', name: 'Storage 0', enabled: true },
    { id: 'storage-1', name: 'Storage 1', enabled: true },
    { id: 'storage-2', name: 'Storage 2', enabled: true },
    { id: 'storage-3', name: 'Storage 3', enabled: false },
  ]);
  expect(read('kind=storages').hasMore).toBe(false);
});

it.each([
  '',
  'kind=unknown',
  'kind=tags&page=0',
  'kind=tags&page=-1',
  'kind=tags&page=9007199254740992',
  'kind=tags&kind=albums',
  'kind=tags&selectedId=',
  'kind=tags&surprise=1',
])('rejects invalid option queries: %s', (params) => {
  expect(() => read(params)).toThrow();
});
