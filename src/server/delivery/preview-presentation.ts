import type { mediaImages, VersionKind } from '../media/schema.ts';

const previewMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/apng',
  'image/gif',
  'image/webp',
  'image/avif',
]);

/** Only existing, browser-displayable versions are candidates, independent of default links. */
export function selectPreviewVersion(
  image: Pick<
    typeof mediaImages.$inferSelect,
    'format' | 'classification' | 'animated'
  >,
  versions: readonly { kind: VersionKind; mime: string }[],
): VersionKind | null {
  const order: VersionKind[] =
    image.classification === 'preview_only' ||
    ['svg', 'ico', 'tiff', 'heif', 'heic'].includes(image.format.toLowerCase())
      ? ['thumbnail']
      : image.animated || image.classification === 'animated'
        ? ['original', 'compressed', 'thumbnail']
        : ['compressed', 'original', 'thumbnail'];
  return (
    order.find((kind) =>
      versions.some(
        (version) => version.kind === kind && previewMimes.has(version.mime),
      ),
    ) ?? null
  );
}
