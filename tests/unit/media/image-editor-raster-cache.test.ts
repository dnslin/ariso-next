import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  loadImage,
  releaseImage,
} from '../../../src/components/image-editor/raster';
import { watermarkImageUrl } from '../../../src/components/image-editor/client';

const firstUrl = watermarkImageUrl('first-logo');
const secondUrl = watermarkImageUrl('second-logo');
beforeEach(() => {
  class Image {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = '';
    set src(value: string) {
      this.value = value;
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this.value;
    }
  }
  vi.stubGlobal('window', { Image });
});
afterEach(() => {
  releaseImage(firstUrl);
  releaseImage(secondUrl);
  vi.unstubAllGlobals();
});

it('releases a decoded logo cache entry without changing an image already held by a canvas', async () => {
  const held = await loadImage(firstUrl);
  expect(await loadImage(firstUrl)).toBe(held);
  releaseImage(firstUrl);
  expect(held.src).toBe(firstUrl);
  expect(await loadImage(firstUrl)).not.toBe(held);
});

it('can release a previous template logo while keeping the currently used logo cached', async () => {
  const previous = await loadImage(firstUrl);
  const current = await loadImage(secondUrl);
  releaseImage(firstUrl);
  expect(await loadImage(secondUrl)).toBe(current);
  expect(await loadImage(firstUrl)).not.toBe(previous);
});
