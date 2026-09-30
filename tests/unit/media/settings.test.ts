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
      watermarkAssetId: null,
      watermarkText: '',
      watermarkFont: 'chinese',
      watermarkFontSize: 3,
      watermarkColor: '#FFFFFF',
      watermarkStrokeColor: '#000000',
      watermarkStrokeWidth: 0,
      watermarkOpacity: 50,
      watermarkPosition: 'bottom-right',
      watermarkMargin: 2,
      watermarkWidth: 20,
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
            watermarkText: '水印',
            watermarkAssetId:
              watermarkMode === 'image'
                ? '8fde381c-59e5-4c5b-a356-2271897a1398'
                : null,
            defaultLinkVersion,
          });
          expect(result.success).toBe(valid);
          if (!result.success)
            expect(result.error.issues[0].path).toEqual(['defaultLinkVersion']);
        }
      }
    },
  );
  it('requires a selected asset for image watermark mode', () => {
    const result = mediaSettingsInputSchema.safeParse({
      ...initialMediaSettings,
      watermarkMode: 'image',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(['watermarkAssetId']);
  });
  it('requires the entire settings value rather than silently filling absent fields', () => {
    expect(
      mediaSettingsInputSchema.safeParse({ compressionEnabled: false }).success,
    ).toBe(false);
  });
});

it('rejects unknown save fields instead of silently discarding them', () => {
  expect(
    mediaSettingsInputSchema.safeParse({
      ...initialMediaSettings,
      unknown: true,
    }).success,
  ).toBe(false);
});
it.each(['', '字'.repeat(201), 'a\nb\nc\nd\ne\nf'])(
  'rejects invalid active watermark text %j',
  (watermarkText) => {
    expect(
      mediaSettingsInputSchema.safeParse({
        ...initialMediaSettings,
        watermarkMode: 'text',
        watermarkText,
      }).success,
    ).toBe(false);
  },
);
it.each(['off', 'text'] as const)(
  'rejects NUL text with a field error even in %s mode',
  (watermarkMode) => {
    const result = mediaSettingsInputSchema.safeParse({
      ...initialMediaSettings,
      watermarkMode,
      watermarkText: 'A\0B',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(['watermarkText']);
  },
);
it('counts Unicode characters rather than UTF-16 units and preserves literal text', () => {
  const watermarkText = '😀'.repeat(200);
  expect(
    mediaSettingsInputSchema.parse({
      ...initialMediaSettings,
      watermarkMode: 'text',
      watermarkText,
    }).watermarkText,
  ).toBe(watermarkText);
});
it.each([
  ['watermarkFont', 'arbitrary-path'],
  ['watermarkFontSize', 0.9],
  ['watermarkFontSize', 20.1],
  ['watermarkColor', '#fff'],
  ['watermarkStrokeColor', 'black'],
  ['watermarkStrokeWidth', -1],
  ['watermarkStrokeWidth', 10.1],
  ['watermarkOpacity', -1],
  ['watermarkOpacity', 101],
  ['watermarkPosition', 'left'],
  ['watermarkMargin', -1],
  ['watermarkMargin', 20.1],
  ['watermarkWidth', 0.9],
  ['watermarkWidth', 100.1],
])('rejects watermark %s=%s', (field, value) => {
  expect(
    mediaSettingsInputSchema.safeParse({
      ...initialMediaSettings,
      [field]: value,
    }).success,
  ).toBe(false);
});
it('accepts fractional watermark dimensions and opacity', () => {
  const fractional = {
    watermarkFontSize: 1.5,
    watermarkStrokeWidth: 0.5,
    watermarkOpacity: 40.5,
    watermarkMargin: 2.5,
    watermarkWidth: 20.5,
  };
  expect(
    mediaSettingsInputSchema.parse({ ...initialMediaSettings, ...fractional }),
  ).toMatchObject(fractional);
});
