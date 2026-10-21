import { expect, it } from 'vitest';
import {
  readShareListQuery,
  shareListHref,
} from '../../../src/app/shares/list-query';

it('keeps album sharing as the existing default and preserves image type across pagination and search', () => {
  expect(readShareListQuery(new URLSearchParams())).toEqual({
    kind: 'album',
    q: '',
    page: 1,
    pageSize: 40,
  });
  const image = { kind: 'image' as const, q: '旅行', page: 2, pageSize: 20 };
  expect(
    readShareListQuery(
      new URL(shareListHref(image), 'https://example.test').searchParams,
    ),
  ).toEqual(image);
  expect(shareListHref({ ...image, q: '新搜索', page: 1 })).toContain(
    'kind=image',
  );
  expect(shareListHref({ ...image, kind: 'album' })).not.toContain('kind=');
});
it('rejects duplicate or unknown types while retaining the existing query validation', () => {
  for (const query of [
    'kind=all',
    'kind=image&kind=album',
    'kind=image&page=0',
    'kind=image&pageSize=200',
  ])
    expect(() => readShareListQuery(new URLSearchParams(query))).toThrow();
});
