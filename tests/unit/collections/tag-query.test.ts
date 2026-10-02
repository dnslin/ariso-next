import { expect, it } from 'vitest';
import { parseTagQuery } from '../../../src/server/collections/tag-query.ts';

it('normalizes Unicode case-folded literal searches and validates pagination', () => {
  expect(parseTagQuery(new URLSearchParams())).toEqual({
    q: '',
    page: 1,
    pageSize: 40,
  });
  expect(
    parseTagQuery(
      new URLSearchParams({
        q: ' STRAẞE%_e\u0301 ',
        page: '2',
        pageSize: '80',
      }),
    ),
  ).toEqual({ q: 'strasse%_é', page: 2, pageSize: 80 });
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
    expect(() => parseTagQuery(new URLSearchParams(input)), input).toThrow(
      '标签查询参数无效',
    );
});
