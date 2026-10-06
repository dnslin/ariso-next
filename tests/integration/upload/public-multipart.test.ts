import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createMediaResources } from '../../../src/server/media/resources.ts';
import { receiveMultipart } from '../../../src/server/upload/multipart.ts';
import { UploadError } from '../../../src/server/upload/errors.ts';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-public-multipart-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function request(fields: string, suffix = '--test--\r\n') {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=test' },
    body: fields + suffix,
  });
}
const field = (name: string, value: string) =>
  `--test\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const file =
  '--test\r\nContent-Disposition: form-data; name="file"; filename="folder/旅行.png"\r\nContent-Type: image/png\r\n\r\nimage\r\n';
function options() {
  return {
    path: join(directory, 'source'),
    resources: createMediaResources(),
    maxBytes: 5,
    signal: new AbortController().signal,
  };
}
it.each([true, false])(
  'streams an unknown-size file with fields before=%s and preserves UTF8 names',
  async (before) => {
    const seen: string[][] = [];
    let name: string | undefined;
    const fields = field('tag', '旅行') + field('tag', 'Go');
    const result = await receiveMultipart(
      request(before ? fields + file : file + fields),
      {
        ...options(),
        onField: (name, value) => seen.push([name, value]),
        onFile: (info) => {
          name = info.filename;
        },
      },
    );
    expect(result).toEqual({ byteSize: 5 });
    expect(seen).toEqual([
      ['tag', '旅行'],
      ['tag', 'Go'],
    ]);
    expect(name).toBe('folder/旅行.png');
    expect(await readFile(join(directory, 'source'), 'utf8')).toBe('image');
  },
);
it.each(['individual', 'combined'] as const)(
  'rejects %s field budget excess without truncating accepted input',
  async (kind) => {
    const fields =
      kind === 'individual'
        ? field('tag', 'x'.repeat(256 * 1024 + 1))
        : field('tag', 'x'.repeat(128 * 1024)) +
          field('tag', 'y'.repeat(128 * 1024));
    await expect(
      receiveMultipart(request(file + fields), {
        ...options(),
        onField: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_FIELDS_TOO_LARGE', status: 400 });
  },
);
it('propagates field validation and closes a writer even when the field follows the file', async () => {
  await expect(
    receiveMultipart(request(file + field('unknown', 'value')), {
      ...options(),
      onField() {
        throw new UploadError('UPLOAD_UNKNOWN_FIELD', 'Unknown field: unknown');
      },
    }),
  ).rejects.toMatchObject({
    code: 'UPLOAD_UNKNOWN_FIELD',
    status: 400,
    message: 'Unknown field: unknown',
  });
});
