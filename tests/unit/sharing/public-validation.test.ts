import { expect, it } from 'vitest';
import {
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
