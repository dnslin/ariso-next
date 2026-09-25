import { describe, expect, it } from 'vitest';
import { initialPreview } from '../../../src/components/library/detail-preview';
import type {
  LibraryDetail,
  LibraryDetailVersion,
} from '../../../src/server/library/detail-types';

function detail(
  available: string[],
  animated = false,
  svg = false,
): LibraryDetail {
  return {
    id: 'image',
    displayName: '图片',
    originalName: '图片.png',
    format: 'png',
    mime: 'image/png',
    width: 640,
    height: 480,
    byteSize: 128,
    animated,
    pageCount: 1,
    classification: 'static',
    visibility: 'private',
    processingStatus: 'ready',
    createdAt: new Date(0).toISOString(),
    trashedAt: null,
    deletionStatus: null,
    storage: { id: 'local', name: '本地', enabled: true },
    albums: [],
    tags: [],
    activeJob: null,
    latestFailedJob: null,
    defaultVersion: 'watermark',
    defaultLink: {
      actualVersion: null,
      links: null,
      downloadPath: null,
      unavailableReason: '未保存',
    },
    versions: (
      ['original', 'compressed', 'thumbnail', 'watermark'] as const
    ).map((kind): LibraryDetailVersion => ({
      kind,
      applicable: true,
      saved: available.includes(kind),
      format: 'png',
      mime: 'image/png',
      width: 640,
      height: 480,
      byteSize: 128,
      previewPath:
        available.includes(kind) && !(svg && kind === 'original')
          ? `/i/image?type=${kind}`
          : null,
      downloadPath: null,
      links: null,
      unavailableReason: null,
    })),
  };
}

describe('initial detail preview is independent of the default link', () => {
  it('prefers a saved compressed version for static images', () => {
    expect(
      initialPreview(detail(['original', 'compressed', 'thumbnail'])),
    ).toBe('compressed');
  });
  it('preserves animation with the saved original', () => {
    expect(
      initialPreview(detail(['original', 'compressed', 'thumbnail'], true)),
    ).toBe('original');
  });
  it('uses the saved original after initial processing fails', () => {
    expect(
      initialPreview({ ...detail(['original']), processingStatus: 'failed' }),
    ).toBe('original');
  });
  it('shows only the thumbnail preview for an SVG attachment', () => {
    expect(initialPreview(detail(['original', 'thumbnail'], false, true))).toBe(
      'thumbnail',
    );
  });
  it('keeps an explicit original placeholder when no version can be viewed', () => {
    expect(initialPreview(detail([]))).toBe('original');
  });
});
