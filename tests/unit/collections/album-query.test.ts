import { expect, it } from 'vitest';
import { parseAlbumQuery } from '../../../src/server/collections/album-management.ts';
it('normalizes literal name searches and validates pagination', () => {
  expect(parseAlbumQuery(new URLSearchParams())).toEqual({
    q: '',
    page: 1,
    pageSize: 40,
  });
  expect(
    parseAlbumQuery(
      new URLSearchParams({ q: ' e\u0301%_ ', page: '2', pageSize: '80' }),
    ),
  ).toEqual({ q: 'é%_', page: 2, pageSize: 80 });
  for (const input of [
    'page=0',
    'page=-1',
    'page=1.5',
    'page=',
    'page=Infinity',
    'page=9007199254740991',
    'pageSize=30',
    'pageSize=',
    'q=a&q=b',
    'page=1&page=2',
    'sort=name',
  ])
    expect(() => parseAlbumQuery(new URLSearchParams(input)), input).toThrow(
      '相册查询参数无效',
    );
});
