import { expect, it } from 'vitest';
import {
  parsePublicShareQuery,
  publicRefreshInputSchema,
  publicShareCursorSchema,
} from '../../../src/server/sharing/validation.ts';

it('accepts opaque public image IDs and no attribute-bearing cursor contract', () => {
  expect(publicShareCursorSchema.parse(null)).toBeNull();
  expect(publicShareCursorSchema.parse('public-image')).toBe('public-image');
  for (const cursor of [
    '',
    'a/b',
    'a\\b',
    'a\n',
    { imageId: 'image', joinedAt: 1 },
  ])
    expect(publicShareCursorSchema.safeParse(cursor).success).toBe(false);
});

it('parses only one optional cursor and rejects unknown, repeated and invalid query values', () => {
  expect(parsePublicShareQuery(new URLSearchParams())).toEqual({
    kind: 'page',
    cursor: null,
  });
  expect(
    parsePublicShareQuery(new URLSearchParams({ cursor: 'public-image' })),
  ).toEqual({ kind: 'page', cursor: 'public-image' });
  expect(
    parsePublicShareQuery(new URLSearchParams('imageId=public-image')),
  ).toEqual({
    kind: 'neighbors',
    imageId: 'public-image',
  });
  for (const query of [
    'pageSize=80',
    'owner=true',
    'cursor=a&cursor=b',
    'cursor=',
    'cursor=a%2Fb',
    'cursor=a%5Cb',
    'cursor=a%0A',
    'imageId=',
    'imageId=a%2Fb',
    'imageId=a%5Cb',
    'imageId=a%0A',
    'imageId=a&imageId=b',
    'imageId=a&cursor=b',
  ])
    expect(() =>
      parsePublicShareQuery(new URLSearchParams(query)),
    ).toThrowError(
      expect.objectContaining({ code: 'SHARING_INVALID_INPUT', status: 400 }),
    );
});

it('bounds refresh input before deduplicating and permits an empty visible collection', () => {
  expect(publicRefreshInputSchema.parse({ ids: [] })).toEqual({ ids: [] });
  expect(publicRefreshInputSchema.parse({ ids: ['image', 'image'] })).toEqual({
    ids: ['image'],
  });
  expect(
    publicRefreshInputSchema.parse({
      ids: Array.from({ length: 80 }, (_, index) => `image-${index}`),
    }).ids,
  ).toHaveLength(80);
  for (const input of [
    {},
    { ids: [''] },
    { ids: Array(81).fill('image') },
    { ids: ['image'], owner: true },
  ])
    expect(publicRefreshInputSchema.safeParse(input).success).toBe(false);
});
