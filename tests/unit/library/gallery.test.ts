import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../../src/server/library/types';
import { layoutGallery } from '../../../src/app/library/gallery-layout';
import { visibleGalleryIndexes } from '../../../src/components/gallery/layout';
import { intersectingGalleryIds } from '../../../src/app/library/gallery-drag-selection';

const image: LibraryItem = {
  id: 'image',
  displayName: '图像.jpg',
  originalName: 'image.jpg',
  byteSize: 1024,
  format: 'jpg',
  width: 640,
  height: 480,
  visibility: 'public',
  processingStatus: 'ready',
  createdAt: '2026-09-30T00:00:00Z',
  storage: { id: 'local', name: '本地存储', enabled: true },
  versions: {
    original: true,
    compressed: false,
    thumbnail: true,
    watermark: false,
  },
  thumbnailUrl: '/i/image?type=thumbnail',
  thumbnailDimensions: { width: 640, height: 480 },
  activeJob: null,
  latestFailedJob: null,
  metadataJob: null,
  processingJob: null,
  trashedAt: null,
  deletionStatus: null,
};
const images = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...image,
    id: String(index),
  }));

describe('gallery layout', () => {
  it.each([
    [360, 328, 2, 12, 210],
    [390, 358, 2, 12, 210],
    [430, 398, 2, 12, 210],
    [768, 736, 3, 12, 210],
    [1199, 1167, 3, 12, 210],
    [1200, 904, 4, 20, 272],
    [1440, 1144, 4, 20, 272],
  ])(
    'places grid cards at viewport %i without changing server order',
    (viewport, width, columns, gap, height) => {
      const result = layoutGallery(images(8), 'grid', width, viewport);
      expect(result.lanes).toHaveLength(columns);
      expect(result.slots.map((slot) => slot.index)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7,
      ]);
      expect(result.slots[0].height).toBe(height);
      expect(result.slots[columns].top).toBe(height + gap);
      const lastColumn = result.slots[columns - 1];
      expect(lastColumn.left + lastColumn.width).toBeCloseTo(width);
    },
  );

  it.each([
    [390, 358, 194.5],
    [1440, 1144, 247],
  ])('uses album card geometry at %i', (viewport, width, height) => {
    const result = layoutGallery(images(8), 'grid', width, viewport, true);
    expect(result.slots[0].height).toBe(height);
    expect(result.slots[0].imageHeight).toBe(viewport >= 1200 ? 190 : 130);
  });

  it('reserves a complete row for diagnostics without overlapping the next grid row', () => {
    const items = images(6);
    items[1].processingStatus = 'processing';
    const result = layoutGallery(items, 'grid', 358, 390);
    expect(result.slots[1].height).toBe(232);
    expect(result.slots[2].top).toBe(244);
    expect(result.slots[3].top).toBe(244);
    expect(result.height).toBe(result.slots[5].top + result.slots[5].height);
  });

  it('uses thumbnail aspect ratios even before it loads and stacks in the shortest lane', () => {
    const items = images(5);
    items[0].thumbnailDimensions = { width: 640, height: 1280 };
    items[1].thumbnailDimensions = { width: 640, height: 320 };
    const result = layoutGallery(items, 'masonry', 358, 390);
    expect(result.slots[0].imageHeight).toBe(342);
    expect(result.slots[1].imageHeight).toBe(85.5);
    expect(result.slots[2].left).toBe(result.slots[1].left);
    expect(result.slots[2].top).toBe(result.slots[1].height + 12);
    for (const lane of result.lanes) {
      for (let index = 1; index < lane.length; index++) {
        expect(lane[index].top).toBe(
          lane[index - 1].top + lane[index - 1].height + 12,
        );
      }
    }
  });

  it('uses the design placeholder dimensions when dimensions have not been identified', () => {
    const result = layoutGallery(
      [{ ...image, thumbnailDimensions: null }],
      'masonry',
      358,
      390,
    );
    expect(result.slots[0].imageHeight).toBe(130);
    expect(result.height).toBe(210);
    expect(layoutGallery([], 'grid', 358, 390).height).toBe(0);
  });
});

describe('gallery render window', () => {
  it.each(['grid', 'masonry'] as const)(
    'bounds mounted cards after loading 100,000 %s records and retains focus and adjacent Tab targets',
    (layout) => {
      const items = images(100_000);
      const result = layoutGallery(items, layout, 1144, 1440);
      const indexes = visibleGalleryIndexes(
        result.lanes,
        100_000,
        102_000,
        10,
        items.length,
      );
      expect(indexes.length).toBeLessThan(50);
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      expect(indexes).toEqual(expect.arrayContaining([9, 10, 11]));
      const expectedVisible = result.slots
        .filter(
          (slot) => slot.top + slot.height >= 100_000 && slot.top <= 102_000,
        )
        .map((slot) => slot.index);
      expect(
        indexes.filter((index) => index > 11 && index < items.length - 1),
      ).toEqual(expectedVisible);
    },
  );

  it('includes very tall visible masonry cards even when their start is above the window', () => {
    const items = images(100);
    items[0].thumbnailDimensions = { width: 640, height: 100_000 };
    const result = layoutGallery(items, 'masonry', 358, 390);
    const indexes = visibleGalleryIndexes(
      result.lanes,
      2000,
      3000,
      -1,
      items.length,
    );
    expect(indexes).toContain(0);
    expect(indexes.filter((index) => index !== 99)).toEqual(
      result.slots
        .filter((slot) => slot.top + slot.height >= 2000 && slot.top <= 3000)
        .map((slot) => slot.index),
    );
  });

  it('does not retain an accumulating trail of prior focused cards', () => {
    const result = layoutGallery(images(100), 'grid', 358, 390);
    expect(visibleGalleryIndexes(result.lanes, 20_000, 21_000, 0, 100)).toEqual(
      [0, 1, 99],
    );
    expect(
      visibleGalleryIndexes(result.lanes, 20_000, 21_000, 99, 100),
    ).toEqual([0, 98, 99]);
  });
});

it('retains the data boundaries for Tab entry from the toolbar and reverse Tab from load-more', () => {
  const result = layoutGallery(images(100), 'grid', 358, 390);
  const indexes = visibleGalleryIndexes(result.lanes, 4000, 4500, -1, 100);
  expect(indexes[0]).toBe(0);
  expect(indexes.at(-1)).toBe(99);
});

it.each(['grid', 'masonry'] as const)(
  'box-selects loaded %s cards outside the rendered window without selecting gaps',
  (layout) => {
    const items = images(2400);
    const result = layoutGallery(items, layout, 1144, 1440);
    const target = result.slots[1200];
    expect(
      visibleGalleryIndexes(result.lanes, 0, 600, -1, items.length),
    ).not.toContain(1200);
    expect(
      intersectingGalleryIds(
        { left: target.left + 10, top: target.top + 10, width: 10, height: 10 },
        result.slots,
        items,
      ),
    ).toEqual(['1200']);
    const first = result.slots[0];
    expect(
      intersectingGalleryIds(
        { left: first.width + 2, top: 10, width: 5, height: 5 },
        result.slots,
        items,
      ),
    ).toEqual([]);
    expect(
      intersectingGalleryIds(
        { left: 0, top: 0, width: 1144, height: result.height },
        result.slots,
        items,
      ),
    ).toHaveLength(2400);
  },
);

it('uses the saved thumbnail ratio after orientation without changing the grid height', () => {
  const rotated = {
    ...image,
    width: 1200,
    height: 800,
    thumbnailDimensions: { width: 427, height: 640 },
  };
  const masonry = layoutGallery([rotated], 'masonry', 358, 390);
  expect(masonry.slots[0].imageHeight).toBeCloseTo((171 * 640) / 427);
  expect(layoutGallery([rotated], 'grid', 358, 390).slots[0].imageHeight).toBe(
    130,
  );
});
