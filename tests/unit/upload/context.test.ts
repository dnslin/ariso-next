import { describe, expect, it } from 'vitest';
import {
  albumUploadHref,
  readUploadContext,
  uploadContextItems,
  uploadDraftKey,
} from '../../../src/components/upload/context';
import type { UploadItem } from '../../../src/components/upload/types';

describe('full-page upload context', () => {
  it('carries an album and its exact query back to the full upload page', () => {
    const returnTo = '/albums/a?page=2&layout=masonry';
    const href = albumUploadHref('a', returnTo);
    const params = Object.fromEntries(
      new URL(href, 'http://ariso.test').searchParams,
    );
    expect(readUploadContext(params)).toEqual({ albumId: 'a', returnTo });
  });

  it.each([
    'https://outside.test/albums/a',
    'javascript:alert(1)',
    '/albums/b',
    'http://[invalid',
  ])('only returns to the originating album: %s', (returnTo) => {
    expect(readUploadContext({ albumId: 'a', returnTo })).toEqual({
      albumId: 'a',
      returnTo: '/albums/a',
    });
  });

  it('ignores ambiguous album parameters and does not infer an album from the return URL', () => {
    expect(
      readUploadContext({ albumId: ['a', 'b'], returnTo: '/albums/a' }),
    ).toEqual({});
    expect(readUploadContext({ returnTo: '/albums/a' })).toEqual({});
  });

  it('isolates queued files and retains relevant submitted uploads even after the draft target changes', () => {
    const base: UploadItem = {
      id: 'page',
      name: 'image.png',
      size: 5,
      previewUrl: null,
      state: 'queued',
      progress: 0,
    };
    const items: UploadItem[] = [
      base,
      { ...base, id: 'album', draftKey: uploadDraftKey('a') },
      { ...base, id: 'other', draftKey: uploadDraftKey('b') },
      {
        ...base,
        id: 'frozen',
        state: 'upload-failed',
        draftKey: uploadDraftKey('a'),
        targetAlbumIds: ['b'],
        canRetry: true,
      },
      {
        ...base,
        id: 'background',
        state: 'processing',
        frozenSubmission: {
          id: 's',
          number: 1,
          count: 1,
          groups: [1],
          storageName: 'Local',
          visibility: 'private',
          albums: [{ id: 'a', name: 'A' }],
          tags: [],
        },
      },
    ];
    expect(uploadContextItems(items).map((item) => item.id)).toEqual([
      'page',
      'frozen',
      'background',
    ]);
    expect(uploadContextItems(items, 'a').map((item) => item.id)).toEqual([
      'album',
      'frozen',
      'background',
    ]);
    expect(uploadContextItems(items, 'b').map((item) => item.id)).toEqual([
      'other',
      'frozen',
    ]);
  });
});
