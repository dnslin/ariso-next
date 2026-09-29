import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectImageFile } from '../../../src/server/media/file-formats.ts';
import { startMediaTool } from '../../../src/server/media/tools.ts';
import { validateWatermarkFile } from '../../../src/server/media/watermark-validation.ts';

vi.mock('../../../src/server/media/file-formats.ts', () => ({
  inspectImageFile: vi.fn(),
}));
vi.mock('../../../src/server/media/tools.ts', () => ({
  startMediaTool: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe('watermark validation error boundaries', () => {
  it('reports invalid container metadata as an invalid watermark', async () => {
    const parsed = z.number().positive().safeParse(0);
    vi.mocked(inspectImageFile).mockRejectedValue(parsed.error);
    await expect(
      validateWatermarkFile(
        '/source',
        '/workspace',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
      cause: parsed.error,
    });
  });
  it.each([
    Object.assign(new Error('magick unavailable'), { code: 'ENOENT' }),
    Object.assign(new Error('cancelled'), { isCanceled: true }),
    Object.assign(new Error('deadline exceeded'), { timedOut: true }),
    Object.assign(new Error('disk full'), { code: 'ENOSPC' }),
  ])('preserves operational failure: $message', async (error) => {
    vi.mocked(inspectImageFile).mockRejectedValue(error);
    await expect(
      validateWatermarkFile(
        '/source',
        '/workspace',
        new AbortController().signal,
      ),
    ).rejects.toBe(error);
  });

  it.each([1, 2])(
    'classifies SVG runner exit %i without masking operational errors',
    async (exitCode) => {
      vi.mocked(inspectImageFile).mockResolvedValue({
        format: 'SVG',
        mime: 'image/svg+xml',
        coder: 'svg',
        extension: 'svg',
        width: 64,
        height: 48,
        animated: false,
        pageCount: 1,
        classification: 'preview_only',
      });
      const failure = Object.assign(
        new Error(
          exitCode === 2
            ? 'SVG active element: script'
            : 'EACCES: cannot write preview',
        ),
        { exitCode },
      );
      vi.mocked(startMediaTool).mockReturnValue({
        settled: Promise.resolve(failure),
      } as ReturnType<typeof startMediaTool>);
      const result = expect(
        validateWatermarkFile(
          '/source',
          '/workspace',
          new AbortController().signal,
        ),
      ).rejects;
      if (exitCode === 2)
        await result.toMatchObject({
          code: 'MEDIA_WATERMARK_INVALID',
          cause: failure,
        });
      else await result.toBe(failure);
    },
  );

  it('reports a corrupt image as invalid and retains the decoder diagnostic', async () => {
    vi.mocked(inspectImageFile).mockResolvedValue({
      format: 'PNG',
      mime: 'image/png',
      coder: 'png',
      extension: 'png',
      width: 64,
      height: 48,
      animated: false,
      pageCount: 1,
      classification: 'static',
    });
    const failure = Object.assign(new Error('PNG IDAT CRC error'), {
      exitCode: 1,
    });
    vi.mocked(startMediaTool).mockReturnValue({
      settled: Promise.resolve(failure),
    } as ReturnType<typeof startMediaTool>);
    await expect(
      validateWatermarkFile(
        '/source',
        '/workspace',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
      cause: failure,
    });
  });

  it('preserves decoder cache exhaustion instead of blaming image content', async () => {
    vi.mocked(inspectImageFile).mockResolvedValue({
      format: 'PNG',
      mime: 'image/png',
      coder: 'png',
      extension: 'png',
      width: 6000,
      height: 6000,
      animated: false,
      pageCount: 1,
      classification: 'static',
    });
    const failure = Object.assign(
      new Error('magick: cache resources exhausted'),
      {
        exitCode: 1,
      },
    );
    vi.mocked(startMediaTool).mockReturnValue({
      settled: Promise.resolve(failure),
    } as ReturnType<typeof startMediaTool>);
    await expect(
      validateWatermarkFile(
        '/source',
        '/workspace',
        new AbortController().signal,
      ),
    ).rejects.toBe(failure);
  });
});
