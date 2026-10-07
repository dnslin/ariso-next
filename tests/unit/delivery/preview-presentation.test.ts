import { expect, it } from 'vitest';
import { selectPreviewVersion } from '../../../src/server/delivery/preview-presentation.ts';
import type {
  mediaImages,
  VersionKind,
} from '../../../src/server/media/schema.ts';

const image = {
  format: 'PNG',
  animated: false,
  classification: 'static',
} as const;
const versions = (kinds: VersionKind[]) =>
  kinds.map((kind) => ({ kind, mime: 'image/webp' }));

it('prefers a saved displayable compressed version, then original and then existing thumbnail', () => {
  expect(
    selectPreviewVersion(
      image,
      versions(['original', 'compressed', 'thumbnail', 'watermark']),
    ),
  ).toBe('compressed');
  expect(selectPreviewVersion(image, versions(['original', 'thumbnail']))).toBe(
    'original',
  );
  expect(selectPreviewVersion(image, versions(['thumbnail']))).toBe(
    'thumbnail',
  );
  expect(selectPreviewVersion(image, versions(['watermark']))).toBeNull();
  expect(selectPreviewVersion(image, [])).toBeNull();
});

it('preserves animation and uses only established previews for attachment/container formats', () => {
  for (const patch of [
    { animated: true },
    { classification: 'animated' },
  ] as const)
    expect(
      selectPreviewVersion(
        { ...image, ...patch },
        versions(['original', 'compressed', 'thumbnail']),
      ),
    ).toBe('original');
  for (const format of ['SVG', 'ICO', 'TIFF', 'HEIC', 'HEIF']) {
    expect(
      selectPreviewVersion(
        { ...image, format },
        versions(['original', 'compressed', 'thumbnail']),
      ),
    ).toBe('thumbnail');
    expect(
      selectPreviewVersion({ ...image, format }, versions(['original'])),
    ).toBeNull();
  }
  expect(
    selectPreviewVersion(
      { ...image, classification: 'preview_only' },
      versions(['original', 'thumbnail']),
    ),
  ).toBe('thumbnail');
});

it('excludes non-displayable MIME types and does not infer unknown formats as browser-readable', () => {
  const unknown: Pick<
    typeof mediaImages.$inferSelect,
    'format' | 'classification' | 'animated'
  > = { format: 'unknown', classification: null, animated: null };
  expect(
    selectPreviewVersion(unknown, [
      { kind: 'original', mime: 'application/octet-stream' },
    ]),
  ).toBeNull();
  expect(
    selectPreviewVersion(image, [
      { kind: 'compressed', mime: 'image/heic' },
      ...versions(['original', 'thumbnail']),
    ]),
  ).toBe('original');
  expect(
    selectPreviewVersion(image, [
      { kind: 'original', mime: 'image/svg+xml' },
      ...versions(['thumbnail']),
    ]),
  ).toBe('thumbnail');
});
