import { sep } from 'node:path';
import { ZodError } from 'zod';
import { analyzeMediaError, mediaError } from './errors.ts';
import { inspectImageFile } from './file-formats.ts';
import { startSvgPreview } from './svg.ts';
import { startMediaTool } from './tools.ts';

export const WATERMARK_MAX_BYTES = 5 * 1024 * 1024;

/** The caller bounds input bytes and owns the workspace until all tools settle. */
export async function validateWatermarkFile(
  path: string,
  workspace: string,
  signal: AbortSignal,
  diskLimitBytes?: number,
): Promise<{
  format: 'PNG' | 'WEBP' | 'SVG';
  mime: string;
  width: number;
  height: number;
}> {
  let contentFailureExitCode = 1;
  try {
    const facts = await inspectImageFile(
      path,
      workspace,
      signal,
      diskLimitBytes,
    );
    if (
      (facts.format !== 'PNG' &&
        facts.format !== 'WEBP' &&
        facts.format !== 'SVG') ||
      facts.animated ||
      facts.pageCount !== 1
    )
      throw mediaError(
        'MEDIA_WATERMARK_INVALID',
        'Watermarks must be static PNG, WebP or SVG images',
      );

    if (facts.format === 'SVG') {
      // The SVG runner reserves exit 2 for invalid content; exit 1 is operational.
      contentFailureExitCode = 2;
      const tool = startSvgPreview(
        path,
        `${workspace}${sep}preview.png`,
        workspace,
        signal,
      );
      const error = await tool.settled;
      if (error) throw error;
      const { width, height } = JSON.parse((await tool.child).stdout) as {
        width: number;
        height: number;
      };
      return { format: 'SVG', mime: facts.mime, width, height };
    }

    // Ping/signature checks can succeed on truncated files. Decode every pixel
    // without writing a derivative; promote decoder warnings to rejection.
    const tool = startMediaTool(
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
        '-regard-warnings',
        `${facts.coder}:${path}`,
        'null:',
      ],
      { workspace, cancelSignal: signal, timeout: 30_000 },
    );
    const error = await tool.settled;
    if (error) throw error;
    if (facts.width === null || facts.height === null)
      throw mediaError(
        'MEDIA_WATERMARK_INVALID',
        'Missing watermark dimensions',
      );
    return {
      format: facts.format,
      mime: facts.mime,
      width: facts.width,
      height: facts.height,
    };
  } catch (error) {
    const detail = error as { code?: string; exitCode?: number };
    if (
      error instanceof ZodError ||
      ['MEDIA_IDENTIFICATION_FAILED', 'MEDIA_FORMAT_UNSUPPORTED'].includes(
        detail.code ?? '',
      ) ||
      (detail.exitCode === contentFailureExitCode &&
        analyzeMediaError(error).code === 'MEDIA_PROCESS_FAILED')
    )
      throw mediaError(
        'MEDIA_WATERMARK_INVALID',
        'Invalid watermark image',
        error,
      );
    throw error;
  }
}
