import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  loadImage,
  releaseImage,
  renderEditedImage,
} from '../../../src/components/image-editor/raster';
import type { EditorImage } from '../../../src/components/image-editor/types';
import { watermarkImageUrl } from '../../../src/components/image-editor/client';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing';

const sourceUrl = '/api/images/source/edit/source';
const logoUrl = watermarkImageUrl('test-logo');
const image: EditorImage = {
  id: 'source',
  imageId: 'source',
  name: 'source.png',
  src: sourceUrl,
  sourceUrl,
  sourceObjectId: 'source-object',
  format: 'png',
  mime: 'image/png',
  width: 20,
  height: 10,
  unavailableReason: null,
  watermarkPreview: { copy: false, overwrite: false },
};

class TestImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 8;
  naturalHeight = 4;
  private value = '';
  set src(value: string) {
    this.value = value;
    if (value === logoUrl) {
      this.naturalWidth = 4;
      this.naturalHeight = 2;
    }
    queueMicrotask(() =>
      value.endsWith('/failed') ? this.onerror?.() : this.onload?.(),
    );
  }
  get src() {
    return this.value;
  }
  pixel(x: number, y: number) {
    return this.src === logoUrl ? 'logo' : `${x},${y}`;
  }
}

// This small raster fake samples pixels and records text placement; real font
// rasterization and browser Canvas rendering are covered by browser acceptance.
class TestCanvas {
  width = 0;
  height = 0;
  pixels = new Map<string, string>();
  text: Array<{
    value: string;
    x: number;
    y: number;
    font: string;
    color: string;
    opacity: number;
    rotation: number;
  }> = [];
  context = new TestContext(this);
  getContext() {
    return this.context;
  }
  toDataURL() {
    throw new Error('Immediate previews must not be encoded');
  }
  pixel(x: number, y: number) {
    return this.pixels.get(`${x},${y}`);
  }
}

class TestContext {
  fillStyle = '#000000';
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  font = '';
  textAlign = '';
  textBaseline = '';
  private offset = { x: 0, y: 0, rotation: 0 };
  private stack: Array<typeof this.offset> = [];
  constructor(private canvas: TestCanvas) {}
  save() {
    this.stack.push({ ...this.offset });
  }
  restore() {
    this.offset = this.stack.pop()!;
  }
  translate(x: number, y: number) {
    this.offset.x += x;
    this.offset.y += y;
  }
  rotate(rotation: number) {
    this.offset.rotation += rotation;
  }
  measureText(text: string) {
    return { width: text.length };
  }
  fillText(value: string, x: number, y: number) {
    this.canvas.text.push({
      value,
      x: x + this.offset.x,
      y: y + this.offset.y,
      font: this.font,
      color: this.fillStyle,
      opacity: this.globalAlpha,
      rotation: this.offset.rotation,
    });
  }
  fillRect(x: number, y: number, width: number, height: number) {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) {
        this.canvas.pixels.set(`${column},${row}`, this.fillStyle);
      }
    }
  }
  drawImage(source: TestImage | TestCanvas, ...bounds: number[]) {
    const sourceWidth =
      source instanceof TestImage ? source.naturalWidth : source.width;
    const sourceHeight =
      source instanceof TestImage ? source.naturalHeight : source.height;
    const [sx, sy, sw, sh, dx, dy, dw, dh] =
      bounds.length === 8
        ? bounds
        : [
            0,
            0,
            sourceWidth,
            sourceHeight,
            ...bounds,
            sourceWidth,
            sourceHeight,
          ];
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const pixel = source.pixel(
          Math.floor(sx + (x * sw) / dw),
          Math.floor(sy + (y * sh) / dh),
        );
        if (pixel !== undefined)
          this.canvas.pixels.set(
            `${dx + x + this.offset.x},${dy + y + this.offset.y}`,
            pixel,
          );
      }
    }
  }
}

const fontLoad = vi.fn(async () => []);
beforeEach(() => {
  fontLoad.mockClear();
  vi.stubGlobal('window', { Image: TestImage });
  vi.stubGlobal('document', {
    createElement: (name: string) => {
      if (name !== 'canvas') throw new Error(`Unexpected element: ${name}`);
      return new TestCanvas();
    },
    fonts: { load: fontLoad },
  });
});
afterEach(() => {
  releaseImage(sourceUrl);
  releaseImage(logoUrl);
  releaseImage(`${sourceUrl}/failed`);
  vi.unstubAllGlobals();
});

it('returns the drawn canvas at decoded source dimensions without PNG encoding', async () => {
  const result = await renderEditedImage(image, emptyImageEditRecipe());
  expect(result).toBeInstanceOf(TestCanvas);
  expect(result).toMatchObject({ width: 8, height: 4 });
  const rendered = result as unknown as TestCanvas;
  expect(rendered.pixel(0, 0)).toBe('0,0');
  expect(rendered.pixel(7, 3)).toBe('7,3');
});

it('returns solid and pixelated regions while preserving pixels outside their bounds', async () => {
  const recipe = emptyImageEditRecipe();
  recipe.regions = [
    {
      id: 'solid',
      x: 0,
      y: 0,
      width: 0.25,
      height: 0.5,
      mode: 'solid',
      strength: 16,
      color: '#123456',
    },
    {
      id: 'pixelate',
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
      mode: 'pixelate',
      strength: 80,
      color: '#000000',
    },
  ];
  const rendered = (await renderEditedImage(
    image,
    recipe,
  )) as unknown as TestCanvas;
  expect(rendered.pixel(0, 0)).toBe('#123456');
  expect(rendered.pixel(1, 1)).toBe('#123456');
  expect(rendered.pixel(2, 1)).toBe('2,1');
  expect(rendered.pixel(0, 2)).toBe('0,2');
  expect(rendered.pixel(4, 0)).toBe('4,0');
  expect(rendered.pixel(5, 1)).toBe('4,0');
  expect(rendered.pixel(7, 3)).toBe('6,2');
});

it('renders text watermark inputs with their font, position, opacity and rotation', async () => {
  const recipe = emptyImageEditRecipe();
  Object.assign(recipe.watermark, {
    enabled: true,
    text: 'Ariso',
    font: 'latin',
    x: 0.5,
    y: 0.5,
    fontSize: 0.1,
    color: '#123456',
    opacity: 0.4,
    rotation: 90,
  });
  const rendered = (await renderEditedImage(
    image,
    recipe,
  )) as unknown as TestCanvas;
  expect(fontLoad).toHaveBeenCalledWith('500 1px Arial', 'Ariso');
  expect(rendered.text).toEqual([
    {
      value: 'Ariso',
      x: 4,
      y: 2,
      font: '500 1px Arial, sans-serif',
      color: '#123456',
      opacity: 0.4,
      rotation: Math.PI / 2,
    },
  ]);
});

it('draws an image watermark from its decoded asset and retains reusable images', async () => {
  const source = await loadImage(sourceUrl);
  const logo = await loadImage(logoUrl);
  const recipe = emptyImageEditRecipe();
  Object.assign(recipe.watermark, {
    enabled: true,
    kind: 'image',
    assetId: 'test-logo',
    x: 0.5,
    y: 0.5,
    width: 0.5,
  });
  const rendered = (await renderEditedImage(
    image,
    recipe,
  )) as unknown as TestCanvas;
  expect(rendered.pixel(2, 1)).toBe('logo');
  expect(rendered.pixel(5, 2)).toBe('logo');
  expect(rendered.pixel(1, 1)).toBe('1,1');
  expect(rendered.pixel(6, 2)).toBe('6,2');
  expect(await loadImage(sourceUrl)).toBe(source);
  expect(await loadImage(logoUrl)).toBe(logo);
  expect(fontLoad).not.toHaveBeenCalled();
});

it('preserves source decoding failures so the caller can display and retry them', async () => {
  await expect(
    renderEditedImage(
      { ...image, src: `${sourceUrl}/failed` },
      emptyImageEditRecipe(),
    ),
  ).rejects.toThrow('无法读取图片，请重新选择图片或重试。');
});
