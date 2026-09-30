import { z } from 'zod';
import { mediaError } from './errors.ts';
import { startMediaTool } from './tools.ts';

const formats = {
  JPEG: ['image/jpeg', 'jpg', 'jpeg'],
  PNG: ['image/png', 'png', 'png'],
  WEBP: ['image/webp', 'webp', 'webp'],
  AVIF: ['image/avif', 'avif', 'avif'],
  BMP: ['image/bmp', 'bmp', 'bmp'],
  TIFF: ['image/tiff', 'tiff', 'tiff'],
  HEIC: ['image/heic', 'heic', 'heic'],
  GIF: ['image/gif', 'gif', 'gif'],
  ICO: ['image/x-icon', 'ico', 'ico'],
  SVG: ['image/svg+xml', 'svg', 'svg'],
} as const;

type ImageFormat = keyof typeof formats;

async function run(
  command: 'exiftool' | 'magick' | 'ffprobe',
  args: string[],
  workspace: string,
  signal?: AbortSignal,
) {
  const tool = startMediaTool(command, args, {
    workspace,
    cancelSignal: signal,
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const error = await tool.settled;
  if (error) {
    // Unrecognized bytes are ExifTool's documented exit-1 JSON result; preserve
    // operational failures (missing tools, cancellation, timeout) as their cause.
    if (
      command === 'exiftool' &&
      !signal?.aborted &&
      'exitCode' in error &&
      error.exitCode === 1 &&
      'stdout' in error &&
      typeof error.stdout === 'string'
    ) {
      let output: unknown;
      try {
        output = JSON.parse(error.stdout);
      } catch {
        throw error;
      }
      const rejected = z
        .array(z.object({ 'ExifTool:Error': z.string() }))
        .length(1)
        .safeParse(output);
      if (rejected.success)
        throw mediaError(
          'MEDIA_IDENTIFICATION_FAILED',
          rejected.data[0]['ExifTool:Error'],
          error,
        );
    }
    throw error;
  }
  return (await tool.child).stdout;
}

async function readFacts(
  path: string,
  workspace: string,
  signal?: AbortSignal,
) {
  const output = await run(
    'exiftool',
    [
      '-json',
      '-a',
      '-G1',
      '-n',
      '-FileType',
      '-MIMEType',
      '-ImageWidth',
      '-ImageHeight',
      '-AnimationFrames',
      '-AnimationLoopCount',
      '-FrameCount',
      '-PageCount',
      '-ImageCount',
      '-NumberOfImages',
      '-MajorBrand',
      '-CompatibleBrands',
      '-HandlerType',
      '-Error',
      path,
    ],
    workspace,
    signal,
  );
  const [tags] = z
    .array(z.record(z.string(), z.unknown()))
    .length(1)
    .parse(JSON.parse(output));
  if (tags['ExifTool:Error'])
    throw mediaError(
      'MEDIA_IDENTIFICATION_FAILED',
      String(tags['ExifTool:Error']),
    );
  const native = tags['File:FileType'];
  const format =
    native === 'APNG'
      ? 'PNG'
      : native === 'Extended WEBP' || native === 'WEBP (lossless)'
        ? 'WEBP'
        : native === 'HEIF'
          ? 'HEIC'
          : native === 'MP4' && tags['QuickTime:MajorBrand'] === 'avis'
            ? 'AVIF'
            : native;
  if (typeof format !== 'string' || !Object.hasOwn(formats, format))
    throw mediaError(
      'MEDIA_FORMAT_UNSUPPORTED',
      `Unsupported image format: ${String(native)}`,
    );
  const [mime, extension, coder] = formats[format as ImageFormat];
  // Native dimensions only: EXIF/XMP thumbnails must not override the container.
  const group =
    format === 'PNG'
      ? 'PNG'
      : format === 'WEBP'
        ? 'RIFF'
        : format === 'GIF'
          ? 'GIF'
          : format === 'TIFF'
            ? 'IFD0'
            : format === 'SVG'
              ? 'SVG'
              : 'File';
  const dimension = (key: string) => {
    const value = tags[`${group}:${key}`];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : null;
  };
  return {
    tags,
    facts: {
      format: format as ImageFormat,
      mime,
      extension,
      coder,
      width: dimension('ImageWidth'),
      height: dimension('ImageHeight'),
    },
  };
}

/** Admission reads actual container signatures, without decoding or rendering SVG. */
export async function identifyImageFile(
  path: string,
  workspace: string,
  signal?: AbortSignal,
) {
  return (await readFacts(path, workspace, signal)).facts;
}

/** Full classification runs in the background job, after the original is preserved. */
export async function inspectImageFile(
  path: string,
  workspace: string,
  signal?: AbortSignal,
  diskLimitBytes?: number,
) {
  const { tags, facts } = await readFacts(path, workspace, signal);
  let pageCount = 1;
  let animated = tags['File:FileType'] === 'APNG';
  let { width, height } = facts;
  if (animated) {
    pageCount = z.number().int().positive().parse(tags['PNG:AnimationFrames']);
  } else if (
    facts.format === 'AVIF' &&
    (tags['QuickTime:MajorBrand'] === 'avis' ||
      (Array.isArray(tags['QuickTime:CompatibleBrands']) &&
        tags['QuickTime:CompatibleBrands'].includes('avis')) ||
      Object.entries(tags).some(
        ([key, value]) =>
          /^Track\d+:HandlerType$/.test(key) && value === 'pict',
      ))
  ) {
    const output = await run(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,nb_frames,width,height',
        '-of',
        'json',
        path,
      ],
      workspace,
      signal,
    );
    const {
      streams: [stream],
    } = z
      .object({
        streams: z
          .array(
            z.object({
              codec_name: z.literal('av1'),
              nb_frames: z.coerce.number().int().positive(),
              width: z.number().int().positive(),
              height: z.number().int().positive(),
            }),
          )
          .length(1),
      })
      .parse(JSON.parse(output));
    pageCount = stream.nb_frames;
    width = stream.width;
    height = stream.height;
    animated = true;
  } else if (!['JPEG', 'PNG', 'SVG'].includes(facts.format)) {
    // libheif exposes independent top-level images, excluding alpha/depth/thumbnail
    // items, and orders the declared primary image first. Ping avoids frame expansion.
    const output = await run(
      'magick',
      [
        '-limit',
        'memory',
        '256MiB',
        '-limit',
        'map',
        '0',
        '-limit',
        'thread',
        '1',
        ...(diskLimitBytes === undefined
          ? []
          : ['-limit', 'disk', String(Math.floor(diskLimitBytes))]),
        '-ping',
        `${facts.coder}:${path}`,
        '-format',
        '%w %h %n\n',
        'info:',
      ],
      workspace,
      signal,
    );
    const [first] = output.trim().split('\n');
    const dimensions = z
      .tuple([
        z.coerce.number().int().positive(),
        z.coerce.number().int().positive(),
        z.coerce.number().int().positive(),
      ])
      .parse(first.split(' '));
    [width, height, pageCount] = dimensions;
    animated =
      facts.format === 'GIF'
        ? pageCount > 1
        : facts.format === 'WEBP' &&
          tags['RIFF:AnimationLoopCount'] !== undefined;
    // GIF frame rectangles may be smaller than their logical display canvas.
    if (facts.format === 'GIF') {
      width = facts.width;
      height = facts.height;
    }
  } else if (
    facts.format === 'JPEG' &&
    tags['MPF0:NumberOfImages'] !== undefined
  ) {
    pageCount = z.number().int().positive().parse(tags['MPF0:NumberOfImages']);
  }
  const classification = animated
    ? ('animated' as const)
    : pageCount > 1 || ['GIF', 'SVG', 'ICO'].includes(facts.format)
      ? ('preview_only' as const)
      : ('static' as const);
  return { ...facts, width, height, animated, pageCount, classification };
}
