import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateWatermarkFile } from '../../../src/server/media/watermark-validation.ts';

const fixtures = resolve('tests/fixtures/media-formats');
let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ariso-watermark-validation-'));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function validate(path: string) {
  return validateWatermarkFile(path, workspace, new AbortController().signal);
}

describe('real watermark asset validation', () => {
  it.each([
    ['source.png', 'PNG', 'image/png'],
    ['static.webp', 'WEBP', 'image/webp'],
    ['static.svg', 'SVG', 'image/svg+xml'],
  ])(
    'accepts %s by content and preserves its original bytes',
    async (file, format, mime) => {
      const source = join(workspace, 'misleading.jpg');
      await copyFile(join(fixtures, file), source);
      const original = await readFile(source);
      expect(await validate(source)).toEqual({
        format,
        mime,
        width: 64,
        height: 48,
      });
      expect(await readFile(source)).toEqual(original);
    },
  );

  it.each([
    'animated.png',
    'poster.png',
    'animated.webp',
    'static.jpg',
    'static.gif',
  ])('rejects unsupported or animated %s', async (file) => {
    await expect(validate(join(fixtures, file))).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
    });
  });

  it.each(['source.png', 'static.webp'])(
    'rejects a truncated %s with a recognizable header',
    async (file) => {
      const original = await readFile(join(fixtures, file));
      const source = join(workspace, 'truncated');
      await writeFile(
        source,
        original.subarray(0, Math.floor(original.length / 2)),
      );
      await expect(validate(source)).rejects.toMatchObject({
        code: 'MEDIA_WATERMARK_INVALID',
      });
    },
  );

  it.each([
    '<script>alert(1)</script>',
    '<image href="https://example.invalid/canary"/>',
    '<image href="file:///etc/passwd"/>',
    '<rect onload="alert(1)"/>',
    '<animate attributeName="fill" values="red;blue"/>',
    '<style>@keyframes move { from { opacity: 0 } to { opacity: 1 } }</style>',
    '<rect style="animation:move 1s infinite"/>',
    '<rect>',
  ])('rejects active, external or malformed SVG: %s', async (body) => {
    const source = join(workspace, 'source');
    const original = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${body}</svg>`;
    await writeFile(source, original);
    await expect(validate(source)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
    });
    expect(await readFile(source, 'utf8')).toBe(original);
  });

  it('gets SVG dimensions from viewBox through the existing renderer', async () => {
    const source = join(workspace, 'source');
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="red"/></svg>',
    );
    expect(await validate(source)).toEqual({
      format: 'SVG',
      mime: 'image/svg+xml',
      width: 100,
      height: 50,
    });
  });

  it('rejects APNG with malformed animation metadata', async () => {
    const original = await readFile(join(fixtures, 'animated.png'));
    original.writeUInt32BE(0, original.indexOf('acTL') + 4);
    const source = join(workspace, 'source.png');
    await writeFile(source, original);
    await expect(validate(source)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
    });
  });

  it('preserves SVG preview file errors as operational failures', async () => {
    const source = join(fixtures, 'static.svg');
    // Existing workspace contains a directory at the output filename.
    await mkdir(join(workspace, 'preview.png'));
    const result = validate(source);
    await expect(result).rejects.toMatchObject({ exitCode: 1 });
    await expect(result).rejects.not.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
    });
  });

  it('rejects non-image bytes', async () => {
    const source = join(workspace, 'source.png');
    await writeFile(source, Buffer.from([0, 1, 2, 3]));
    await expect(validate(source)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_INVALID',
    });
  });
});
