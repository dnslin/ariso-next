import { sep } from 'node:path';
import { mediaError } from './errors.ts';
import { startSvgPreview } from './svg.ts';
import { startMediaTool } from './tools.ts';
import type { ProcessingSnapshot } from './validation.ts';

// Fixed built-in IDs, never a user-supplied font path. Linux paths match the image.
export const watermarkFonts =
  process.platform === 'darwin'
    ? {
        chinese: '/System/Library/Fonts/STHeiti Medium.ttc',
        latin: '/System/Library/Fonts/Supplemental/Arial.ttf',
      }
    : {
        chinese: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        latin: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      };

/** ImageMagick label: interprets these independently of shell argument escaping. */
export function escapeWatermarkText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replace(/^@/, '\\@');
}

export function watermarkPlacement(
  width: number,
  height: number,
  markWidth: number,
  markHeight: number,
  margin: number,
  position: ProcessingSnapshot['watermarkPosition'],
) {
  if (markWidth > width - 2 * margin || markHeight > height - 2 * margin)
    throw mediaError(
      'MEDIA_WATERMARK_TOO_LARGE',
      '水印超出画布可用范围，请减小字号、描边或边距',
    );
  return {
    x: position.endsWith('left')
      ? margin
      : position.endsWith('right')
        ? width - margin - markWidth
        : Math.round((width - markWidth) / 2),
    y: position.startsWith('top')
      ? margin
      : position.startsWith('bottom')
        ? height - margin - markHeight
        : Math.round((height - markHeight) / 2),
  };
}

/** Prepare within the caller's owned workspace and disk budget; the final encoder consumes these args. */
export async function prepareWatermark(input: {
  sourceArgs: string[];
  snapshot: ProcessingSnapshot;
  watermarksRoot?: string;
  workspace: string;
  diskLimitBytes: number;
  signal: AbortSignal;
}) {
  const { snapshot, workspace, signal } = input;
  const limits = [
    '-limit',
    'memory',
    '256MiB',
    '-limit',
    'map',
    '0',
    '-limit',
    'disk',
    String(Math.floor(input.diskLimitBytes)),
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
    });
    const error = await tool.settled;
    if (error) throw error;
    return (await tool.child).stdout;
  };
  const canvas = `${workspace}${sep}watermark-canvas.miff`;
  const overlay = `${workspace}${sep}watermark-overlay.png`;
  const dimensions = await run([
    ...input.sourceArgs,
    '-strip',
    '-write',
    `miff:${canvas}`,
    '-format',
    '%w %h',
    'info:',
  ]);
  const [width, height] = dimensions.split(' ').map(Number);
  const shortEdge = Math.min(width, height);
  const margin = Math.round((shortEdge * snapshot.watermarkMargin) / 100);
  let overlayArgs: string[];
  if (snapshot.watermarkMode === 'text') {
    overlayArgs = [
      '-background',
      'none',
      '-density',
      '72',
      '-font',
      watermarkFonts[snapshot.watermarkFont],
      '-pointsize',
      String(
        Math.max(1, Math.round((shortEdge * snapshot.watermarkFontSize) / 100)),
      ),
      '-fill',
      snapshot.watermarkColor,
      '-stroke',
      snapshot.watermarkStrokeColor,
      '-strokewidth',
      String(snapshot.watermarkStrokeWidth),
      `label:${escapeWatermarkText(snapshot.watermarkText)}`,
    ];
  } else {
    const asset = snapshot.watermarkAsset;
    if (!asset || !input.watermarksRoot)
      throw mediaError(
        'MEDIA_WATERMARK_ASSET_MISSING',
        '图片水印缺少素材或素材目录',
      );
    const targetWidth = Math.max(
      1,
      Math.round(
        Math.min(
          (width * snapshot.watermarkWidth) / 100,
          width - 2 * margin,
          ((height - 2 * margin) * asset.width) / asset.height,
        ),
      ),
    );
    let assetInput = `${asset.format.toLowerCase()}:${input.watermarksRoot}${sep}${asset.path}`;
    if (asset.format === 'SVG') {
      const raster = `${workspace}${sep}watermark-svg.png`;
      const tool = startSvgPreview(
        `${input.watermarksRoot}${sep}${asset.path}`,
        raster,
        workspace,
        signal,
        targetWidth,
      );
      const error = await tool.settled;
      if (error) throw error;
      assetInput = `png:${raster}`;
    }
    overlayArgs = [
      assetInput,
      '-colorspace',
      'sRGB',
      '-resize',
      `${targetWidth}x${height - 2 * margin}`,
    ];
  }
  const size = await run([
    ...overlayArgs,
    '-alpha',
    'set',
    '-channel',
    'A',
    '-evaluate',
    'multiply',
    String(snapshot.watermarkOpacity / 100),
    '+channel',
    '-strip',
    '-write',
    `png:${overlay}`,
    '-format',
    '%w %h',
    'info:',
  ]);
  const [markWidth, markHeight] = size.split(' ').map(Number);
  const { x, y } = watermarkPlacement(
    width,
    height,
    markWidth,
    markHeight,
    margin,
    snapshot.watermarkPosition,
  );
  return [
    `miff:${canvas}`,
    `png:${overlay}`,
    '-geometry',
    `+${x}+${y}`,
    '-compose',
    'Over',
    '-composite',
  ];
}
