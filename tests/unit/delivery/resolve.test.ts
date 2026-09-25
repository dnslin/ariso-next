import { describe, expect, it } from 'vitest';
import {
  buildImagePath,
  buildImageUrl,
  parseImageRequest,
  resolveImageVersion,
} from '../../../src/server/delivery/links.ts';
import type { getImageAccessState } from '../../../src/server/media/images.ts';
import {
  versionKinds,
  type VersionKind,
} from '../../../src/server/media/schema.ts';

type State = NonNullable<ReturnType<typeof getImageAccessState>>;
function state(saved: VersionKind[], applicable: boolean | null = true) {
  return {
    versions: versionKinds.map((kind) => ({
      kind,
      applicable:
        kind === 'original' || kind === 'thumbnail' ? true : applicable,
      saved: saved.includes(kind)
        ? {
            version: { kind, objectId: `${kind}-object` },
            object: { id: `${kind}-object` },
          }
        : null,
    })),
  } as State;
}

describe('delivery parameters and stable links', () => {
  it('builds same-origin image paths with encoded identifiers and explicit options', () => {
    expect(buildImagePath('旅行 ?#%&')).toBe(
      '/i/%E6%97%85%E8%A1%8C%20%3F%23%25%26',
    );
    expect(buildImagePath('image 1', undefined, true)).toBe(
      '/i/image%201?download=1',
    );
    for (const kind of versionKinds) {
      expect(buildImagePath('image-1', kind)).toBe(`/i/image-1?type=${kind}`);
      expect(buildImagePath('image-1', kind, true)).toBe(
        `/i/image-1?type=${kind}&download=1`,
      );
    }
  });
  it('keeps the thumbnail path on the current origin when the public origin changes', () => {
    const path = buildImagePath('旅行 ?#', 'thumbnail');
    expect(path).toBe('/i/%E6%97%85%E8%A1%8C%20%3F%23?type=thumbnail');
    for (const publicUrl of [
      'https://old.example',
      'https://new.example:8443/',
    ]) {
      const url = new URL(buildImageUrl(publicUrl, '旅行 ?#', 'thumbnail'));
      expect(`${url.pathname}${url.search}`).toBe(path);
      expect(url.origin).toBe(new URL(publicUrl).origin);
      expect(new URL(path, 'https://admin.example').origin).toBe(
        'https://admin.example',
      );
    }
  });
  it('accepts default and explicit requests and ignores unrelated parameters', () => {
    expect(
      parseImageRequest('image-1', new URLSearchParams('width=100')),
    ).toEqual({
      imageId: 'image-1',
      selectedVersion: undefined,
      download: false,
    });
    for (const kind of versionKinds) {
      expect(
        parseImageRequest(
          'image-1',
          new URLSearchParams(`type=${kind}&download=1&width=100`),
        ),
      ).toEqual({ imageId: 'image-1', selectedVersion: kind, download: true });
    }
  });
  it.each([
    'type=',
    'type=other',
    'type=original&type=original',
    'download=',
    'download=0',
    'download=true',
    'download=1&download=1',
  ])('rejects invalid query %s', (query) => {
    expect(() =>
      parseImageRequest('image-1', new URLSearchParams(query)),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: 'INVALID_IMAGE_REQUEST',
        message: '图片请求参数无效',
      }),
    );
  });
  it.each(['', 'a/b', 'a\\b', 'a\n'])('rejects invalid image ID %j', (id) => {
    expect(() => parseImageRequest(id, new URLSearchParams())).toThrow(
      expect.objectContaining({
        status: 400,
        code: 'INVALID_IMAGE_REQUEST',
        message: '图片请求参数无效',
      }),
    );
  });
  it('uses the current configured public origin and encodes image identifiers', () => {
    const oldUrl = buildImageUrl('https://old.example', '旅行 ?#');
    const newUrl = buildImageUrl('https://new.example:8443/', '旅行 ?#');
    expect(new URL(oldUrl).origin).toBe('https://old.example');
    expect(new URL(newUrl).origin).toBe('https://new.example:8443');
    expect(new URL(newUrl).pathname).toBe('/i/%E6%97%85%E8%A1%8C%20%3F%23');
    expect(new URL(newUrl).search).toBe('');
    expect(new URL(newUrl).hash).toBe('');
  });
  it('generates default URLs without freezing the resolved version', () => {
    expect(buildImageUrl('https://images.example/', 'image 1')).toBe(
      'https://images.example/i/image%201',
    );
    expect(
      buildImageUrl('https://images.example', 'image-1', 'watermark', true),
    ).toBe('https://images.example/i/image-1?type=watermark&download=1');
    expect(
      buildImageUrl('https://images.example', 'image-1', undefined, true),
    ).toBe('https://images.example/i/image-1?download=1');
  });
});

describe('delivery current version selection', () => {
  it.each(versionKinds)(
    'selects saved explicit %s regardless of current switches',
    (kind) => {
      expect(
        resolveImageVersion(state([kind]), kind, 'original').actualVersion,
      ).toBe(kind);
    },
  );
  it('re-evaluates the current default without changing the default URL', () => {
    const image = state(['original', 'compressed', 'watermark']);
    for (const kind of ['original', 'compressed', 'watermark'] as const) {
      expect(resolveImageVersion(image, undefined, kind)).toMatchObject({
        actualVersion: kind,
        object: { id: `${kind}-object` },
      });
    }
  });
  it('uses original only when the default is known to be inapplicable', () => {
    expect(
      resolveImageVersion(state(['original'], false), undefined, 'compressed')
        .actualVersion,
    ).toBe('original');
    expect(() =>
      resolveImageVersion(state(['original'], false), 'compressed', 'original'),
    ).toThrow(expect.objectContaining({ code: 'VERSION_UNAVAILABLE' }));
  });
  it.each([true, null])(
    'does not silently fall back for applicable=%s and missing historical or failed versions',
    (applicable) => {
      expect(() =>
        resolveImageVersion(
          state(['original'], applicable),
          undefined,
          'watermark',
        ),
      ).toThrow(
        expect.objectContaining({
          status: 404,
          code: 'VERSION_UNAVAILABLE',
          message: '请求的图片版本不可用',
        }),
      );
    },
  );
  it('does not return a thumbnail in place of a missing original', () => {
    expect(() =>
      resolveImageVersion(state(['thumbnail'], false), undefined, 'compressed'),
    ).toThrow(expect.objectContaining({ code: 'VERSION_UNAVAILABLE' }));
  });
});
