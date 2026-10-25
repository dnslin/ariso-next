import { join } from 'node:path';
import {
  regionPixels,
  type ImageEditRecipe,
} from '../../shared/image-editing.ts';
import { mediaError } from './errors.ts';
import { startSvgPreview } from './svg.ts';
import { startMediaTool } from './tools.ts';
import type { WatermarkAssetSnapshot } from './validation.ts';
import { escapeWatermarkText, watermarkFonts } from './watermark.ts';

type EditFormat = 'JPEG' | 'PNG' | 'WEBP';
export type EditRenderOptions = {
  sourcePath: string;
  format: EditFormat;
  recipe: ImageEditRecipe;
  watermarkAsset?: WatermarkAssetSnapshot;
  watermarksRoot?: string;
  workspace: string;
  outputPath: string;
  signal: AbortSignal;
  diskLimitBytes: number;
};

function offset(x: number, y: number) {
  return `${x < 0 ? '' : '+'}${x}${y < 0 ? '' : '+'}${y}`;
}

/** Full-size rendering; the caller owns the workspace, persistence and disk budget. */
export async function renderEditedFile(options: EditRenderOptions) {
  const { recipe, signal, workspace } = options;
  signal.throwIfAborted();
  const limits = [
    '-limit',
    'memory',
    '256MiB',
    '-limit',
    'map',
    '0',
    '-limit',
    'disk',
    String(Math.floor(options.diskLimitBytes)),
    '-limit',
    'thread',
    '1',
  ];
  const run = async (args: string[]) => {
    signal.throwIfAborted();
    const tool = startMediaTool('magick', [...limits, ...args], {
      workspace,
      cancelSignal: signal,
      timeout: 120_000,
      env: { MAGICK_TEMPORARY_PATH: workspace },
    });
    const error = await tool.settled;
    if (error) throw error;
    signal.throwIfAborted();
    return (await tool.child).stdout;
  };
  const canvas = `miff:${join(workspace, 'edit-canvas.miff')}`;
  const dimensions = await run([
    `${options.format.toLowerCase()}:${options.sourcePath}[0]`,
    '-auto-orient',
    '-colorspace',
    'sRGB',
    '-strip',
    '-write',
    canvas,
    '-format',
    '%w %h',
    'info:',
  ]);
  const [width, height] = dimensions.trim().split(/\s+/).map(Number);

  for (const region of recipe.regions) {
    const area = regionPixels(region, width, height);
    const geometry = `${area.width}x${area.height}${offset(area.x, area.y)}`;
    if (region.mode === 'solid') {
      // Copy replaces alpha as well, so transparent source pixels become opaque.
      await run([
        canvas,
        '(',
        '-size',
        `${area.width}x${area.height}`,
        `xc:${region.color}`,
        ')',
        '-geometry',
        offset(area.x, area.y),
        '-compose',
        'Copy',
        '-composite',
        canvas,
      ]);
    } else {
      const block = Math.max(
        2,
        Math.round((Math.min(width, height) * region.strength) / 1000),
      );
      const reduced = `${Math.max(1, Math.ceil(area.width / block))}x${Math.max(1, Math.ceil(area.height / block))}!`;
      await run([
        canvas,
        '(',
        '+clone',
        '-crop',
        geometry,
        '+repage',
        '-filter',
        'Box',
        '-resize',
        reduced,
        '-filter',
        'Point',
        '-resize',
        `${area.width}x${area.height}!`,
        ')',
        '-geometry',
        offset(area.x, area.y),
        '-compose',
        'Copy',
        '-composite',
        canvas,
      ]);
    }
  }

  const mark = recipe.watermark;
  if (mark.enabled) {
    const overlay = `png:${join(workspace, 'edit-watermark.png')}`;
    let source: string[];
    if (mark.kind === 'text') {
      source = [
        '-background',
        'none',
        '-density',
        '72',
        '-font',
        watermarkFonts[mark.font],
        '-pointsize',
        String(
          Math.max(1, Math.round(Math.min(width, height) * mark.fontSize)),
        ),
        '-fill',
        mark.color,
        `label:${escapeWatermarkText(mark.text)}`,
      ];
    } else {
      const asset = options.watermarkAsset;
      if (!asset || !options.watermarksRoot)
        throw mediaError(
          'MEDIA_WATERMARK_ASSET_MISSING',
          '图片水印缺少素材或素材目录',
        );
      const targetWidth = Math.max(1, Math.round(width * mark.width));
      let input = `${asset.format.toLowerCase()}:${join(options.watermarksRoot, asset.path)}`;
      if (asset.format === 'SVG') {
        const path = join(workspace, 'edit-watermark-svg.png');
        const tool = startSvgPreview(
          join(options.watermarksRoot, asset.path),
          path,
          workspace,
          signal,
          targetWidth,
        );
        const error = await tool.settled;
        if (error) throw error;
        input = `png:${path}`;
      }
      source = [input, '-colorspace', 'sRGB', '-resize', `${targetWidth}x`];
    }
    const originalSize = await run([
      ...source,
      '-alpha',
      'set',
      '-channel',
      'A',
      '-evaluate',
      'multiply',
      String(mark.opacity),
      '+channel',
      '-strip',
      '-write',
      overlay,
      '-format',
      '%w %h',
      'info:',
    ]);
    const [markWidth, markHeight] = originalSize
      .trim()
      .split(/\s+/)
      .map(Number);
    const rotatedSize = await run([
      overlay,
      '-background',
      'none',
      '-rotate',
      String(mark.rotation),
      '+repage',
      '-strip',
      '-write',
      overlay,
      '-format',
      '%w %h',
      'info:',
    ]);
    const [rotatedWidth, rotatedHeight] = rotatedSize
      .trim()
      .split(/\s+/)
      .map(Number);
    if (rotatedWidth > width || rotatedHeight > height)
      throw mediaError(
        'MEDIA_WATERMARK_TOO_LARGE',
        '水印超出图片范围，请减小字号、Logo大小或旋转角度',
      );
    const positions: [number, number][] = [];
    if (mark.tiled) {
      const spacingX = Math.max(markWidth * 1.8, width * 0.22);
      const spacingY = Math.max(markHeight * 3.5, height * 0.15);
      for (
        let row = 0, y = spacingY / 2;
        y < height + spacingY;
        row++, y += spacingY
      ) {
        for (
          let x = spacingX * (row % 2 ? 0.25 : 0.75);
          x < width + spacingX;
          x += spacingX
        ) {
          positions.push([
            Math.round(x - rotatedWidth / 2),
            Math.round(y - rotatedHeight / 2),
          ]);
        }
      }
    } else {
      const x = Math.round(mark.x * width - rotatedWidth / 2);
      const y = Math.round(mark.y * height - rotatedHeight / 2);
      if (
        x < 0 ||
        y < 0 ||
        x + rotatedWidth > width ||
        y + rotatedHeight > height
      )
        throw mediaError(
          'MEDIA_WATERMARK_TOO_LARGE',
          '水印超出图片范围，请调整位置或减小水印',
        );
      positions.push([x, y]);
    }
    await run([
      canvas,
      ...positions.flatMap(([x, y]) => [
        overlay,
        '-geometry',
        offset(x, y),
        '-compose',
        'Over',
        '-composite',
      ]),
      canvas,
    ]);
  }

  const format = options.format;
  await run([
    canvas,
    '-strip',
    ...(format === 'JPEG'
      ? ['-quality', '95']
      : format === 'WEBP'
        ? ['-define', 'webp:lossless=true']
        : []),
    `${format.toLowerCase()}:${options.outputPath}`,
  ]);
  return {
    path: options.outputPath,
    width,
    height,
    format,
    mime:
      format === 'JPEG'
        ? 'image/jpeg'
        : format === 'WEBP'
          ? 'image/webp'
          : 'image/png',
  };
}
