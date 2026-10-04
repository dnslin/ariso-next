import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  albumImages,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import { readLibraryCopy } from '../../../src/server/library/copy.ts';
import type {
  LibraryCopyFormat,
  LibraryCopyVersion,
} from '../../../src/server/library/copy-types.ts';
import {
  mediaImages,
  mediaObjects,
  mediaSettings,
  mediaVersions,
  versionKinds,
} from '../../../src/server/media/schema.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { createProductionFixture } from '../../experiments/library/production-fixture.ts';

let directory: string;
let connection: ReturnType<typeof createProductionFixture>;
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
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 100,
      classification: 'static',
      processingStatus: 'ready',
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
      ...values,
    })
    .run();
  save(id, 'original');
}
function save(
  id: string,
  kind: (typeof versionKinds)[number],
  status: typeof mediaObjects.$inferInsert.status = 'stored',
) {
  const image = connection.db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, id))
    .get()!;
  connection.db
    .insert(mediaObjects)
    .values({
      id: `${id}-${kind}`,
      imageId: id,
      storageId: image.storageId,
      key: `never-read/${id}/${kind}`,
      purpose: kind,
      status,
      byteSize: 100,
      format: 'PNG',
      mime: 'image/png',
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
    })
    .run();
  connection.db
    .insert(mediaVersions)
    .values({
      imageId: id,
      kind,
      objectId: `${id}-${kind}`,
      byteSize: 100,
      format: 'PNG',
      mime: 'image/png',
      createdAt: new Date(1000),
    })
    .run();
}
function copy(
  ids: string[],
  query = '',
  version: LibraryCopyVersion = 'default',
  format: LibraryCopyFormat = 'url',
) {
  return readLibraryCopy(connection.db, { ids, query, version, format });
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-copy-'));
  connection = createProductionFixture(join(directory, 'ariso.db'), 0);
  connection.db
    .insert(siteSettings)
    .values({
      publicUrl: 'https://images.example.test',
      timeZone: 'UTC',
      updatedAt: new Date(),
    })
    .run();
  connection.db
    .update(mediaSettings)
    .set({ defaultLinkVersion: 'original' })
    .run();
});
afterEach(() => {
  vi.restoreAllMocks();
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it.each(['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'] as const)(
  'returns full %s order keys across explicit 200-item batches, with deterministic ID ties',
  (sort) => {
    const ids = Array.from(
      { length: 205 },
      (_, i) => `image-${String(i).padStart(3, '0')}`,
    );
    for (const [i, id] of ids.entries())
      seed(id, {
        createdAt: new Date(1000 + Math.floor(i / 3)),
        byteSize: Math.floor(i / 4),
      });
    const result = [
      copy(ids.slice(200).reverse(), `sort=${sort}`),
      copy(ids.slice(0, 200).reverse(), `sort=${sort}`),
    ];
    const merged = result
      .flatMap((response) => response.items)
      .sort((a, b) => {
        const value = a.sortKey.value - b.sortKey.value;
        return (
          (sort.endsWith('desc') ? -value : value) ||
          (a.imageId < b.imageId ? -1 : a.imageId > b.imageId ? 1 : 0)
        );
      });
    const expected = connection.db.$client
      .prepare(
        `select id from media_images order by ${sort.startsWith('size') ? 'byte_size' : 'created_at'} ${sort.endsWith('desc') ? 'desc' : 'asc'},id asc`,
      )
      .all() as { id: string }[];
    expect(merged.map((item) => item.imageId)).toEqual(
      expected.map((item) => item.id),
    );
    expect(merged).toHaveLength(205);
    expect(merged.every((item) => !item.line.includes('?type='))).toBe(true);
    expect(result.every((response) => response.sort === sort)).toBe(true);
  },
);

it('uses album joining order and rechecks tag/filter membership instead of selection order', () => {
  for (const id of ['first', 'last', 'outside', 'wrong-tag'])
    seed(id, { displayName: 'Travel' });
  for (const [id, time] of [
    ['first', 3000],
    ['last', 1000],
    ['wrong-tag', 2000],
  ] as const)
    connection.db
      .insert(albumImages)
      .values({ albumId: 'album-0', imageId: id, joinedAt: new Date(time) })
      .run();
  for (const id of ['first', 'last', 'outside'])
    connection.db
      .insert(imageTags)
      .values({ imageId: id, tagId: 'tag-1' })
      .run();
  const query = 'scope=album&albumId=album-0&tagId=tag-1&q=travel';
  const result = copy(['last', 'outside', 'first', 'wrong-tag'], query);
  expect(result.sort).toBe('joined_desc');
  expect(
    result.items.map((item) => [item.imageId, item.sortKey.value]),
  ).toEqual([
    ['first', 3000],
    ['last', 1000],
  ]);
  expect(result.unavailable.map((item) => item.imageId).sort()).toEqual([
    'outside',
    'wrong-tag',
  ]);
  connection.db
    .delete(albumImages)
    .where(eq(albumImages.imageId, 'first'))
    .run();
  expect(copy(['first'], query).unavailable[0].reason).toBe(
    '图片已不属于当前查询范围',
  );
});

it('continues past disabled, missing, recycled, deleting and unpublished versions while warning private/failed access', () => {
  seed('private', { visibility: 'private' });
  seed('failed', { processingStatus: 'failed' });
  seed('disabled', { storageId: 'storage-3' });
  seed('trash', { trashedAt: new Date() });
  seed('deleting', { deletionStatus: 'deleting' });
  seed('candidate');
  connection.db
    .update(mediaObjects)
    .set({ status: 'writing' })
    .where(eq(mediaObjects.imageId, 'candidate'))
    .run();
  const result = copy([
    'private',
    'failed',
    'disabled',
    'trash',
    'deleting',
    'candidate',
    'missing',
  ]);
  expect(result.items.map((item) => item.imageId)).toEqual([
    'failed',
    'private',
  ]);
  expect(
    result.items.every(
      (item) =>
        item.accessWarning?.includes('外部访客无权访问') &&
        !item.originalDisclosure,
    ),
  ).toBe(true);
  expect(result.unavailable.map((item) => [item.imageId, item.reason])).toEqual(
    [
      ['missing', '图片不存在'],
      ['candidate', '请求的图片版本不可用'],
      ['deleting', '图片已回收或正在删除'],
      ['disabled', '图片所属存储已停用'],
      ['trash', '图片已回收或正在删除'],
    ],
  );
  expect(JSON.stringify(result)).not.toContain('never-read');
});

it('falls back only for an inapplicable default and never for missing or explicit versions', () => {
  seed('animated', { classification: 'animated' });
  seed('static');
  seed('unknown', { classification: null });
  connection.db
    .update(mediaSettings)
    .set({ defaultLinkVersion: 'compressed' })
    .run();
  const result = copy(['animated', 'static', 'unknown']);
  expect(result.items).toMatchObject([
    {
      imageId: 'animated',
      actualVersion: 'original',
      line: 'https://images.example.test/i/animated',
      originalDisclosure: true,
    },
  ]);
  expect(result.unavailable.map((item) => item.imageId)).toEqual([
    'static',
    'unknown',
  ]);
  expect(copy(['animated'], '', 'compressed').items).toEqual([]);
  save('static', 'compressed');
  expect(copy(['static']).items[0]).toMatchObject({
    actualVersion: 'compressed',
    line: 'https://images.example.test/i/static',
    originalDisclosure: false,
  });
  expect(copy(['static'], '', 'compressed').items[0].line).toBe(
    'https://images.example.test/i/static?type=compressed',
  );
});

it('rejects an explicitly selected inapplicable version even when its old bytes are still saved', () => {
  seed('animated-saved', { classification: 'animated' });
  save('animated-saved', 'compressed');
  save('animated-saved', 'watermark');
  for (const version of ['compressed', 'watermark'] as const) {
    const result = copy(['animated-saved'], '', version);
    expect(result.items).toEqual([]);
    expect(result.unavailable).toEqual([
      {
        imageId: 'animated-saved',
        displayName: 'animated-saved',
        reason: '此图片不适用该版本',
        actualVersion: null,
      },
    ]);
    connection.db
      .update(mediaSettings)
      .set({ defaultLinkVersion: version })
      .run();
    expect(copy(['animated-saved']).items).toMatchObject([
      {
        actualVersion: 'original',
        line: 'https://images.example.test/i/animated-saved',
      },
    ]);
  }
});

it('escapes display names in all format/version combinations into exactly one line', () => {
  const id = '图片 ?#%&';
  seed(id, { displayName: '图[一]"<&\r\n行' });
  for (const kind of ['compressed', 'thumbnail', 'watermark'] as const)
    save(id, kind);
  for (const version of ['default', ...versionKinds] as const) {
    const url =
      'https://images.example.test/i/%E5%9B%BE%E7%89%87%20%3F%23%25%26' +
      (version === 'default' ? '' : `?type=${version}`);
    expect(copy([id], '', version, 'url').items[0].line).toBe(url);
    expect(copy([id], '', version, 'markdown').items[0].line).toBe(
      `![图\\[一\\]"\\<&  行](<${url}>)`,
    );
    expect(copy([id], '', version, 'html').items[0].line).toBe(
      `<img src="${url}" alt="图[一]&quot;&lt;&amp;&#13;&#10;行">`,
    );
  }
});

it('rejects malformed, oversized and pagination/trash requests; stale references stay explicit', () => {
  seed('real');
  const request = {
    ids: ['real'],
    query: '',
    version: 'default',
    format: 'url',
  };
  for (const input of [
    { ...request, ids: [] },
    { ...request, ids: Array.from({ length: 201 }, () => 'real') },
    { ...request, ids: ['bad/id'] },
    { ...request, ids: ['bad\\id'] },
    { ...request, version: 'fallback' },
    { ...request, format: 'json' },
    { ...request, extra: true },
    ...['page=1', 'cursor=abc', 'scope=trash', 'unknown=1'].map((query) => ({
      ...request,
      query,
    })),
  ])
    expect(() => readLibraryCopy(connection.db, input)).toThrow(
      expect.objectContaining({ code: 'LIBRARY_INVALID_QUERY' }),
    );
  expect(() => copy(['real'], 'tagId=removed')).toThrow(
    expect.objectContaining({ code: 'LIBRARY_STALE_REFERENCE', status: 409 }),
  );
  expect(copy(['real', 'real']).items).toHaveLength(1);
  expect(copy(['missing']).items).toEqual([]);
});

it('reads only metadata with constant query count, and performs no network, signing or access-count writes', () => {
  for (let i = 0; i < 200; i++) seed(`image-${i}`);
  const network = vi.spyOn(globalThis, 'fetch');
  const before = connection.db.$client
    .prepare('select * from analytics_daily')
    .all();
  const prepare = vi.spyOn(connection.db.$client, 'prepare');
  const result = copy(Array.from({ length: 200 }, (_, i) => `image-${i}`));
  const statements = prepare.mock.calls.map((call) => call[0]);
  expect(result.items).toHaveLength(200);
  expect(statements.filter((sql) => sql.startsWith('select'))).toHaveLength(4);
  expect(
    statements.every((sql) => !/^\s*(insert|update|delete)/i.test(sql)),
  ).toBe(true);
  expect(network).not.toHaveBeenCalled();
  expect(
    connection.db.$client.prepare('select * from analytics_daily').all(),
  ).toEqual(before);
});
