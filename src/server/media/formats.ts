import type { Readable } from 'node:stream';
import { execa } from 'execa';
import { z } from 'zod';

export function mediaError(code: string, message: string, cause?: unknown) {
  return Object.assign(new Error(message, { cause }), { code });
}

// Read native container dimensions, not similarly named EXIF/XMP thumbnail tags.
const factsSchema = z.object({
  'File:FileType': z.string(),
  'File:MIMEType': z.string(),
  'File:ImageWidth': z.number().int().positive().optional(),
  'File:ImageHeight': z.number().int().positive().optional(),
  'PNG:ImageWidth': z.number().int().positive().optional(),
  'PNG:ImageHeight': z.number().int().positive().optional(),
  'RIFF:ImageWidth': z.number().int().positive().optional(),
  'RIFF:ImageHeight': z.number().int().positive().optional(),
  'PNG:AnimationFrames': z.number().optional(),
  'MPF0:NumberOfImages': z.number().optional(),
  'ExifTool:Error': z.string().optional(),
});

/** ExifTool supplies signature/container parsing; no extension or supplied MIME is trusted. */
export async function inspectImage(source: Readable, signal?: AbortSignal) {
  const { stdout } = await execa(
    'exiftool',
    [
      '-json',
      '-G1',
      '-n',
      '-File:FileType',
      '-File:MIMEType',
      '-File:ImageWidth',
      '-File:ImageHeight',
      '-PNG:ImageWidth',
      '-PNG:ImageHeight',
      '-PNG:AnimationFrames',
      '-RIFF:ImageWidth',
      '-RIFF:ImageHeight',
      '-MPF:NumberOfImages',
      '-Error',
      '-',
    ],
    {
      input: source,
      cancelSignal: signal,
      timeout: 30_000,
      forceKillAfterDelay: 1000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const [facts] = z.array(factsSchema).length(1).parse(JSON.parse(stdout));
  if (facts['ExifTool:Error'])
    throw mediaError('MEDIA_IDENTIFICATION_FAILED', facts['ExifTool:Error']);
  const format = facts['File:FileType'];
  const group =
    format === 'PNG' || format === 'APNG'
      ? 'PNG'
      : format === 'WEBP' || format === 'Extended WEBP'
        ? 'RIFF'
        : 'File';
  const width = facts[`${group}:ImageWidth`];
  const height = facts[`${group}:ImageHeight`];
  if (!width || !height)
    throw mediaError(
      'MEDIA_FORMAT_UNSUPPORTED',
      `Cannot identify raster dimensions: ${format}`,
    );
  return {
    format,
    mime: facts['File:MIMEType'],
    width,
    height,
    animated: facts['PNG:AnimationFrames'] !== undefined || format === 'APNG',
    pageCount: facts['MPF0:NumberOfImages'] ?? 1,
  };
}

export function requireFirstImageFormat(
  facts: Awaited<ReturnType<typeof inspectImage>>,
) {
  if (
    facts.animated ||
    facts.pageCount !== 1 ||
    !(
      (facts.format === 'JPEG' && facts.mime === 'image/jpeg') ||
      (facts.format === 'PNG' && facts.mime === 'image/png')
    )
  ) {
    throw mediaError(
      'MEDIA_FORMAT_UNSUPPORTED',
      `First-image processing supports static JPEG/PNG only: ${facts.format}`,
    );
  }
  return facts.format === 'JPEG' ? 'jpeg' : 'png';
}

/** Preserve the diagnostic chain from storage and execa while exposing a stable error code. */
export function describeProcessingError(error: unknown): string {
  let code = 'MEDIA_PROCESS_FAILED';
  let current = error;
  while (current instanceof Error) {
    const detail = current as Error & {
      code?: string;
      timedOut?: boolean;
      isCanceled?: boolean;
    };
    if (
      typeof detail.code === 'string' &&
      (detail.code.startsWith('MEDIA_') || detail.code.startsWith('STORAGE_'))
    )
      code = detail.code;
    if (detail.code === 'ENOENT' && !code.startsWith('STORAGE_'))
      code = 'MEDIA_TOOL_UNAVAILABLE';
    if (
      detail.code === 'ENOSPC' ||
      /no space left on device/i.test(detail.message)
    )
      code = 'INSUFFICIENT_DISK_SPACE';
    if (detail.timedOut) code = 'MEDIA_TOOL_TIMEOUT';
    if (detail.isCanceled || detail.name === 'AbortError')
      code = 'MEDIA_CANCELLED';
    current = detail.cause;
  }
  return `${code}: ${error instanceof Error ? error.message : String(error)}`;
}
