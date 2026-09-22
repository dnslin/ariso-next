import { describe, expect, it } from 'vitest';
import { parse } from 'content-disposition';
import {
  makeHeaders,
  preconditionStatus,
} from '../../experiments/delivery/headers.ts';

const input = {
  objectId: 'object-1',
  size: 123,
  contentType: 'image/webp',
  extension: 'webp',
  displayName: '旅行.final',
  imageId: 'image-1',
  download: false,
  actualVersion: 'compressed',
};

function filename(displayName: string, extension = 'webp') {
  return parse(
    makeHeaders({ ...input, displayName, extension }).get(
      'content-disposition',
    )!,
  ).parameters.filename;
}

describe('delivery response headers', () => {
  it('uses actual object metadata and does not invent Last-Modified', () => {
    const headers = makeHeaders(input);
    expect(Object.fromEntries(headers)).toMatchObject({
      'accept-ranges': 'none',
      'cache-control': 'private, no-store, no-transform',
      'content-length': '123',
      'content-type': 'image/webp',
      etag: '"object-1"',
      'x-ariso-image-version': 'compressed',
      'x-content-type-options': 'nosniff',
    });
    expect(headers.has('last-modified')).toBe(false);
    expect(parse(headers.get('content-disposition')!).type).toBe('inline');
    expect(
      makeHeaders({ ...input, objectId: 'object-2' }).get('etag'),
    ).not.toBe(headers.get('etag'));
  });

  it.each([
    [false, 'image/webp', 'inline'],
    [true, 'image/webp', 'attachment'],
    [false, 'image/svg+xml', 'attachment'],
    [true, 'image/svg+xml', 'attachment'],
  ])('download=%s and %s uses %s', (download, contentType, type) => {
    const headers = makeHeaders({ ...input, download, contentType });
    expect(parse(headers.get('content-disposition')!).type).toBe(type);
    expect(headers.get('content-type')).toBe(contentType);
  });

  it.each([
    ['旅行.final', 'webp', '旅行.final.webp'],
    ['旅行.webp', 'webp', '旅行.webp'],
    ['旅行.jpg', 'webp', '旅行.jpg.webp'],
    ['旅行.webp.webp', 'webp', '旅行.webp.webp'],
    ['旅行.JPEG', 'jpg', '旅行.jpg'],
    ['旅行.jpg', 'jpeg', '旅行.jpg'],
    ['旅行.JPG', '.jpg', '旅行.jpg'],
    [' ..a/\\b\r\n\u0000<>:"|?*.. ', 'webp', 'ab.webp'],
    [' . /\\\r\n ', 'webp', 'image-1.webp'],
    ['.webp', 'webp', 'webp.webp'],
  ])('cleans %s using actual %s as %s', (name, extension, expected) => {
    expect(filename(name, extension)).toBe(expected);
  });

  it('truncates the body to 180 UTF-8 bytes without splitting a character', () => {
    expect(filename('中'.repeat(61))).toBe(`${'中'.repeat(60)}.webp`);
    expect(filename(`${'a'.repeat(179)}😀`)).toBe(`${'a'.repeat(179)}.webp`);
  });

  it.each(['旅行', 'café', '😀'])(
    'encodes %s with an ASCII fallback',
    (name) => {
      const value = makeHeaders({ ...input, displayName: name }).get(
        'content-disposition',
      )!;
      expect(value).toMatch(/^[\x20-\x7e]+$/);
      expect(value).toContain('filename=');
      expect(value).toContain("filename*=UTF-8''");
      expect(parse(value).parameters.filename).toBe(`${name}.webp`);
    },
  );
});

describe('delivery preconditions after authorization and opening', () => {
  const etag = '"object-1"';

  it.each([
    [{}, 200],
    [{ 'if-match': '*' }, 200],
    [{ 'if-match': '"other", "object-1"' }, 200],
    [{ 'if-match': 'W/"object-1"' }, 412],
    [{ 'if-match': '"other"' }, 412],
    [{ 'if-none-match': '*' }, 304],
    [{ 'if-none-match': '"other", W/"object-1"' }, 304],
    [{ 'if-none-match': '"object-1"' }, 304],
    [{ 'if-none-match': '"other"' }, 200],
    [{ 'if-match': '"other"', 'if-none-match': '*' }, 412],
    [{ 'if-match': '*', 'if-none-match': '*' }, 304],
    [{ 'if-modified-since': 'Tue, 01 Jan 2030 00:00:00 GMT' }, 200],
    [{ 'if-unmodified-since': 'Tue, 01 Jan 1980 00:00:00 GMT' }, 200],
    [
      {
        'if-none-match': '"other"',
        'if-modified-since': 'Tue, 01 Jan 2030 00:00:00 GMT',
      },
      200,
    ],
  ])('evaluates %j as %i for GET and HEAD', (headers, status) => {
    for (const method of ['GET', 'HEAD']) {
      const request = new Request('http://localhost/file', {
        method,
        headers: headers as Record<string, string>,
      });
      expect(preconditionStatus(request, etag)).toBe(status);
    }
  });

  it('returns 412 rather than 304 for a non-safe method', () => {
    const request = new Request('http://localhost/file', {
      method: 'POST',
      headers: { 'if-none-match': '*' },
    });
    expect(preconditionStatus(request, etag)).toBe(412);
  });

  it('keeps commas inside an opaque entity tag', () => {
    const request = new Request('http://localhost/file', {
      headers: { 'if-none-match': '"other", W/"object,1"' },
    });
    expect(preconditionStatus(request, '"object,1"')).toBe(304);
  });
});
