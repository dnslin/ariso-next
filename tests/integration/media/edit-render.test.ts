import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emptyImageEditRecipe,
  type ImageEditRecipe,
} from '../../../src/shared/image-editing.ts';
import { renderEditedFile } from '../../../src/server/media/edit-render.ts';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-edit-render-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function source(args: string[], extension = 'png') {
  const path = join(directory, `${randomUUID()}.${extension}`);
  await execa('magick', [...args, path]);
  return path;
}
function render(
  sourcePath: string,
  recipe: ImageEditRecipe,
  extra: Partial<Parameters<typeof renderEditedFile>[0]> = {},
) {
  return renderEditedFile({
    sourcePath,
    format: 'PNG',
    recipe,
    workspace: directory,
    outputPath: join(directory, `${randomUUID()}.result`),
    signal: new AbortController().signal,
    diskLimitBytes: 256 * 1024 * 1024,
    ...extra,
  });
}
async function pixels(path: string) {
  const result = await execa(
    'magick',
    [path, '-alpha', 'on', '-depth', '8', 'rgba:-'],
    { encoding: 'buffer' },
  );
  return Buffer.from(result.stdout);
}
function pixel(data: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return [...data.subarray(offset, offset + 4)];
}

describe('real edited image rendering', () => {
  it('burns an opaque solid rectangle through fractional edge pixels while retaining transparent pixels outside it', async () => {
    const input = await source([
      '-size',
      '101x81',
      'xc:none',
      '-fill',
      'red',
      '-draw',
      'rectangle 0,0 9,9',
    ]);
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'private',
      x: 0.101,
      y: 0.201,
      width: 0.203,
      height: 0.105,
      mode: 'solid',
      strength: 20,
      color: '#272343',
    });
    const output = await render(input, recipe);
    expect(output).toMatchObject({
      width: 101,
      height: 81,
      format: 'PNG',
      mime: 'image/png',
    });
    const data = await pixels(output.path);
    expect(pixel(data, 101, 10, 16)).toEqual([39, 35, 67, 255]);
    expect(pixel(data, 101, 30, 24)).toEqual([39, 35, 67, 255]);
    expect(pixel(data, 101, 31, 24)).toEqual([0, 0, 0, 0]);
    expect(pixel(data, 101, 5, 5)).toEqual([255, 0, 0, 255]);
  });
  it('changes source pixels into blocks without changing pixels outside the selected region', async () => {
    const input = await source(['-size', '120x80', 'gradient:red-blue']);
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'private',
      x: 0.2,
      y: 0.2,
      width: 0.6,
      height: 0.6,
      mode: 'pixelate',
      strength: 80,
      color: '#000000',
    });
    const output = await render(input, recipe);
    const original = await pixels(input),
      edited = await pixels(output.path);
    expect(pixel(original, 120, 32, 17)).not.toEqual(
      pixel(original, 120, 32, 18),
    );
    expect(pixel(edited, 120, 32, 17)).toEqual(pixel(edited, 120, 32, 18));
    expect(pixel(edited, 120, 0, 0)).toEqual(pixel(original, 120, 0, 0));
  });
  it('corrects JPEG orientation before positioning masks and removes source metadata', async () => {
    const input = await source(
      [
        '-size',
        '80x40',
        'xc:white',
        '-fill',
        'red',
        '-draw',
        'rectangle 0,0 20,39',
      ],
      'jpg',
    );
    await execa('exiftool', [
      '-overwrite_original',
      '-Orientation#=6',
      '-Comment=private-note',
      input,
    ]);
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'corner',
      x: 0,
      y: 0,
      width: 0.25,
      height: 0.25,
      mode: 'solid',
      strength: 20,
      color: '#000000',
    });
    const output = await render(input, recipe, { format: 'JPEG' });
    expect(output).toMatchObject({
      width: 40,
      height: 80,
      format: 'JPEG',
      mime: 'image/jpeg',
    });
    expect(
      pixel(await pixels(output.path), 40, 2, 2)
        .slice(0, 3)
        .every((v) => v < 10),
    ).toBe(true);
    const metadata = JSON.parse(
      (await execa('exiftool', ['-json', output.path])).stdout,
    )[0];
    expect(metadata.Comment).toBeUndefined();
    expect(metadata.Orientation).toBeUndefined();
  });
  it('draws readable Chinese text after the mask and applies opacity', async () => {
    const input = await source(['-size', '240x160', 'xc:white']);
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'mask',
      x: 0.2,
      y: 0.25,
      width: 0.6,
      height: 0.5,
      mode: 'solid',
      strength: 20,
      color: '#000000',
    });
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      text: '中文 A',
      fontSize: 0.12,
      opacity: 0.5,
      color: '#ffffff',
      x: 0.5,
      y: 0.5,
    };
    const output = await render(input, recipe);
    const data = await pixels(output.path);
    let translucentText = 0;
    for (let y = 50; y < 110; y++)
      for (let x = 55; x < 185; x++) {
        const [red, green, blue, alpha] = pixel(data, 240, x, y);
        if (
          red > 50 &&
          red < 160 &&
          red === green &&
          red === blue &&
          alpha === 255
        )
          translucentText++;
      }
    expect(translucentText).toBeGreaterThan(25);
    expect(pixel(data, 240, 5, 5)).toEqual([255, 255, 255, 255]);
  });
  it('rotates and tiles a translucent Logo across the image', async () => {
    const input = await source(['-size', '200x120', 'xc:white']);
    const logoPath = await source([
      '-size',
      '40x20',
      'xc:none',
      '-fill',
      'blue',
      '-draw',
      'rectangle 0,0 19,19',
    ]);
    const recipe = emptyImageEditRecipe();
    const assetId = randomUUID();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      kind: 'image',
      assetId,
      width: 0.1,
      rotation: 30,
      tiled: true,
      opacity: 0.5,
    };
    const output = await render(input, recipe, {
      watermarksRoot: directory,
      watermarkAsset: {
        id: assetId,
        path: logoPath.slice(directory.length + 1),
        format: 'PNG',
        mime: 'image/png',
        width: 40,
        height: 20,
        byteSize: (await readFile(logoPath)).length,
      },
    });
    const data = await pixels(output.path);
    const changed = [0, 0, 0, 0];
    for (let y = 0; y < 120; y++)
      for (let x = 0; x < 200; x++) {
        const [red, green, blue] = pixel(data, 200, x, y);
        if (red < 240 && green < 240 && blue > 245)
          changed[(y >= 60 ? 2 : 0) + (x >= 100 ? 1 : 0)]++;
      }
    expect(changed.every((count) => count > 10)).toBe(true);
  });
  it('retains transparent WebP pixels in the encoded mother image', async () => {
    const input = await source(
      [
        '-size',
        '60x40',
        'xc:none',
        '-fill',
        'red',
        '-draw',
        'rectangle 0,0 10,10',
        '-define',
        'webp:lossless=true',
      ],
      'webp',
    );
    const output = await render(input, emptyImageEditRecipe(), {
      format: 'WEBP',
    });
    expect(output).toMatchObject({
      format: 'WEBP',
      mime: 'image/webp',
      width: 60,
      height: 40,
    });
    expect(pixel(await pixels(output.path), 60, 30, 30)[3]).toBe(0);
  });
  it('rasterizes a validated SVG Logo before compositing at its requested size', async () => {
    const input = await source(['-size', '200x120', 'xc:white']);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#0000ff"/></svg>';
    await writeFile(join(directory, 'logo.svg'), svg);
    const assetId = randomUUID();
    const recipe = emptyImageEditRecipe();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      kind: 'image',
      assetId,
      width: 0.2,
      x: 0.5,
      y: 0.5,
      opacity: 1,
    };
    const output = await render(input, recipe, {
      watermarksRoot: directory,
      watermarkAsset: {
        id: assetId,
        path: 'logo.svg',
        format: 'SVG',
        mime: 'image/svg+xml',
        width: 100,
        height: 50,
        byteSize: Buffer.byteLength(svg),
      },
    });
    const data = await pixels(output.path);
    expect(pixel(data, 200, 100, 60)).toEqual([0, 0, 255, 255]);
    expect(pixel(data, 200, 79, 60)).toEqual([255, 255, 255, 255]);
    expect(pixel(data, 200, 121, 60)).toEqual([255, 255, 255, 255]);
  });
  it('never brings source details back when a later pixelation overlaps a solid mask', async () => {
    const input = await source(['-size', '120x80', 'gradient:red-blue']);
    const recipe = emptyImageEditRecipe();
    recipe.regions = [
      {
        id: 'opaque',
        x: 0.2,
        y: 0.2,
        width: 0.5,
        height: 0.5,
        mode: 'solid',
        strength: 80,
        color: '#272343',
      },
      {
        id: 'mosaic',
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.8,
        mode: 'pixelate',
        strength: 80,
        color: '#000000',
      },
    ];
    const output = await render(input, recipe);
    expect(pixel(await pixels(output.path), 120, 50, 35)).toEqual([
      39, 35, 67, 255,
    ]);
  });
  it('reports an unavailable Logo instead of silently omitting the watermark', async () => {
    const input = await source(['-size', '100x80', 'xc:white']);
    const recipe = emptyImageEditRecipe();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      kind: 'image',
      assetId: randomUUID(),
    };
    await expect(render(input, recipe)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_ASSET_MISSING',
    });
  });
  it('rejects single watermarks that do not fit rather than clipping their content', async () => {
    const input = await source(['-size', '100x80', 'xc:white']);
    const recipe = emptyImageEditRecipe();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      text: 'W'.repeat(100),
      fontSize: 0.2,
      x: 0.5,
      y: 0.5,
    };
    await expect(render(input, recipe)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_TOO_LARGE',
    });
    recipe.watermark = { ...recipe.watermark, text: 'A', x: 0 };
    await expect(render(input, recipe)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_TOO_LARGE',
    });
  });
  it('settles native rendering when cancelled', async () => {
    const input = await source(['-size', '1200x800', 'gradient:red-blue']);
    const controller = new AbortController();
    const pending = render(input, emptyImageEditRecipe(), {
      signal: controller.signal,
    });
    controller.abort(new Error('cancel edit rendering'));
    await expect(pending).rejects.toBeInstanceOf(Error);
  });
});
