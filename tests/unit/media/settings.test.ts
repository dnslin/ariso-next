import { describe, expect, it } from 'vitest';
import {
  initialMediaSettings,
  mediaSettingsInputSchema,
} from '../../../src/server/media/validation.ts';

describe('media settings full-save validation', () => {
  it('accepts the specified initialization defaults', () => {
    expect(mediaSettingsInputSchema.parse(initialMediaSettings)).toEqual({
      compressionEnabled: true,
      outputFormat: 'webp',
      quality: 82,
      maxEdge: null,
      jpegBackground: '#FFFFFF',
      watermarkMode: 'off',
      defaultLinkVersion: 'compressed',
      defaultVisibility: 'public',
      concurrency: 1,
    });
  });
  it.each([
    ['quality', 0],
    ['quality', 101],
    ['quality', 1.5],
    ['quality', '82'],
    ['maxEdge', 0],
    ['maxEdge', 32769],
    ['maxEdge', 1.5],
    ['concurrency', 0],
    ['concurrency', 5],
    ['concurrency', 1.5],
    ['outputFormat', 'png'],
    ['jpegBackground', '#fff'],
    ['jpegBackground', 'white'],
    ['watermarkMode', 'both'],
    ['defaultLinkVersion', 'thumbnail'],
    ['defaultVisibility', 'hidden'],
    ['compressionEnabled', 'false'],
  ])('rejects %s=%s with a field error', (field, value) => {
    const result = mediaSettingsInputSchema.safeParse({
      ...initialMediaSettings,
      [field]: value,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        field,
      ]);
  });
  it.each([1, 100])('accepts quality boundary %i', (quality) => {
    expect(
      mediaSettingsInputSchema.parse({ ...initialMediaSettings, quality })
        .quality,
    ).toBe(quality);
  });
  it.each([null, 1, 32768])('accepts maxEdge boundary %s', (maxEdge) => {
    expect(
      mediaSettingsInputSchema.parse({ ...initialMediaSettings, maxEdge })
        .maxEdge,
    ).toBe(maxEdge);
  });
  it.each(['jpeg', 'webp', 'avif'])('accepts output %s', (outputFormat) => {
    expect(
      mediaSettingsInputSchema.parse({
        ...initialMediaSettings,
        outputFormat,
        concurrency: 4,
        jpegBackground: '#aBc123',
      }).outputFormat,
    ).toBe(outputFormat);
  });
  it.each([false, true])(
    'checks every watermark/default combination with compression=%s',
    (compressionEnabled) => {
      for (const watermarkMode of ['off', 'text', 'image']) {
        for (const defaultLinkVersion of [
          'original',
          'compressed',
          'watermark',
        ]) {
          const valid =
            defaultLinkVersion === 'original' ||
            (defaultLinkVersion === 'compressed'
              ? compressionEnabled
              : watermarkMode !== 'off');
          const result = mediaSettingsInputSchema.safeParse({
            ...initialMediaSettings,
            compressionEnabled,
            watermarkMode,
            defaultLinkVersion,
          });
          expect(result.success).toBe(valid);
          if (!result.success)
            expect(result.error.issues[0].path).toEqual(['defaultLinkVersion']);
        }
      }
    },
  );
  it('requires the entire settings value rather than silently filling absent fields', () => {
    expect(
      mediaSettingsInputSchema.safeParse({ compressionEnabled: false }).success,
    ).toBe(false);
  });
});
