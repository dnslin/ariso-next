import { create as contentDisposition } from 'content-disposition';

export type HeaderInput = {
  objectId: string;
  size: number;
  contentType: string;
  extension: string;
  displayName: string;
  imageId: string;
  download: boolean;
  actualVersion: string;
};

export function downloadName(
  input: Pick<HeaderInput, 'extension' | 'displayName' | 'imageId'>,
) {
  const extension = input.extension.replace(/^\./, '').toLowerCase();
  const actualExtension = extension === 'jpeg' ? 'jpg' : extension;
  let body = input.displayName
    .replace(/[\p{Cc}/\\<>:"|?*]/gu, '')
    .replace(/^[\s.]+|[\s.]+$/gu, '');
  const suffix = body.slice(body.lastIndexOf('.') + 1).toLowerCase();
  if (
    body.includes('.') &&
    (suffix === actualExtension ||
      (actualExtension === 'jpg' && suffix === 'jpeg'))
  ) {
    body = body.slice(0, body.lastIndexOf('.'));
  }
  body = body.replace(/^[\s.]+|[\s.]+$/gu, '') || input.imageId;
  let truncated = '';
  let bytes = 0;
  for (const character of body) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 180) break;
    truncated += character;
    bytes += size;
  }
  return `${truncated.replace(/[\s.]+$/gu, '')}.${actualExtension}`;
}

export function makeHeaders(input: HeaderInput): Headers {
  const filename = downloadName(input);
  return new Headers({
    'Cache-Control': 'private, no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
    'X-Ariso-Image-Version': input.actualVersion,
    'Content-Type': input.contentType,
    'Content-Length': String(input.size),
    'Content-Disposition': contentDisposition(filename, {
      type:
        input.download || input.contentType === 'image/svg+xml'
          ? 'attachment'
          : 'inline',
      fallback: filename.replace(/[^\x20-\x7e]/gu, '_'),
    }),
    ETag: `"${input.objectId}"`,
    'Accept-Ranges': 'none',
  });
}

function matches(value: string, etag: string, weak: boolean) {
  if (value.trim() === '*') return true;
  // A comma may be part of an opaque tag, so splitting on commas is incorrect.
  const tags = value.match(/(?:W\/)?"[^"]*"/g) ?? [];
  return tags.some((tag) => (weak ? tag.replace(/^W\//, '') : tag) === etag);
}

export function preconditionStatus(
  request: Request,
  etag: string,
): 200 | 304 | 412 {
  const ifMatch = request.headers.get('if-match');
  if (ifMatch !== null && !matches(ifMatch, etag, false)) return 412;
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch !== null && matches(ifNoneMatch, etag, true)) {
    return request.method === 'GET' || request.method === 'HEAD' ? 304 : 412;
  }
  // There is no Last-Modified validator; date conditions cannot be evaluated.
  return 200;
}
