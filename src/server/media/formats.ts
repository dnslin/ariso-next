import type { Readable } from 'node:stream';
import { z } from 'zod';
import { startMediaTool } from './tools.ts';

import { mediaError } from './errors.ts';

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
export async function inspectImage(
  source: Readable,
  workspace: string,
  signal?: AbortSignal,
) {
  const args = [
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
  ];
  const options = {
    input: source,
    cancelSignal: signal,
    timeout: 30_000,
    forceKillAfterDelay: 1000,
    maxBuffer: 32 * 1024 * 1024,
  };
  const tool = startMediaTool('exiftool', args, { ...options, workspace });
  const error = await tool.settled;
  if (error) {
    // ExifTool reports unrecognized bytes as structured JSON with exit code 1.
    // Keep missing binaries, cancellation and tool failures as operational errors.
    if (
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
  const { stdout } = await tool.child;
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
