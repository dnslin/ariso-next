import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inspectImage,
  requireFirstImageFormat,
} from '../../../src/server/media/formats.ts';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-formats-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

// All raster content is generated from solid colors; no downloaded media fixtures.
async function raster(format: 'jpeg' | 'png', color = 'red') {
  const { stdout } = await execa(
    'magick',
    ['-size', '16x12', `xc:${color}`, '-strip', `${format}:-`],
    { encoding: 'buffer' },
  );
  return Buffer.from(stdout);
}

function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

// PNG 3 §11.3.6: one acTL frame, one fcTL for the default IDAT image, valid CRCs.
// https://www.w3.org/TR/png-3/#animation-information
function singleFrameApng(png: Buffer) {
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(1, 0);
  const frame = Buffer.alloc(26);
  frame.writeUInt32BE(png.readUInt32BE(16), 4);
  frame.writeUInt32BE(png.readUInt32BE(20), 8);
  frame.writeUInt16BE(1, 20);
  frame.writeUInt16BE(10, 22);
  // IHDR occupies bytes 8..32; put both controls before any IDAT.
  return Buffer.concat([
    png.subarray(0, 33),
    pngChunk('acTL', animation),
    pngChunk('fcTL', frame),
    png.subarray(33),
  ]);
}

// A two-image MPF APP2 index pointing at two actual JPEG codestreams.
// Tag/type layout: https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/MPF.pm
function twoImageMpo(first: Buffer, second: Buffer) {
  const tiff = Buffer.alloc(82);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(3, 8);
  tiff.writeUInt16BE(0xb000, 10);
  tiff.writeUInt16BE(7, 12);
  tiff.writeUInt32BE(4, 14);
  tiff.write('0100', 18, 'ascii');
  tiff.writeUInt16BE(0xb001, 22);
  tiff.writeUInt16BE(4, 24);
  tiff.writeUInt32BE(1, 26);
  tiff.writeUInt32BE(2, 30);
  tiff.writeUInt16BE(0xb002, 34);
  tiff.writeUInt16BE(7, 36);
  tiff.writeUInt32BE(32, 38);
  tiff.writeUInt32BE(50, 42);
  const app2 = Buffer.alloc(8 + tiff.length);
  app2.writeUInt16BE(0xffe2, 0);
  app2.writeUInt16BE(app2.length - 2, 2);
  app2.write('MPF\0', 4, 'ascii');
  const firstSize = first.length + app2.length;
  tiff.writeUInt32BE(0x20030000, 50);
  tiff.writeUInt32BE(firstSize, 54);
  tiff.writeUInt32BE(0x00020002, 66);
  tiff.writeUInt32BE(second.length, 70);
  // Offsets are relative to the TIFF header, which begins at file byte 10.
  tiff.writeUInt32BE(firstSize - 10, 74);
  tiff.copy(app2, 8);
  return Buffer.concat([first.subarray(0, 2), app2, first.subarray(2), second]);
}

// These tests require the real tools. Missing executables fail rather than skip.
describe('native container identification through tool stdin', () => {
  it.each(['jpeg', 'png'] as const)(
    '%s dimensions come from raster headers rather than contradictory EXIF tags',
    async (format) => {
      const file = join(directory, `metadata.${format}`);
      await execa('magick', ['-size', '16x12', 'xc:red', file]);
      await execa('exiftool', [
        '-overwrite_original',
        '-IFD0:ImageWidth=999',
        '-IFD0:ImageHeight=777',
        file,
      ]);
      const bytes = await readFile(file);
      const { stdout } = await execa(
        'exiftool',
        ['-json', '-G1', '-n', '-IFD0:ImageWidth', '-IFD0:ImageHeight', '-'],
        { input: bytes },
      );
      expect(JSON.parse(stdout)[0]).toMatchObject({
        'IFD0:ImageWidth': 999,
        'IFD0:ImageHeight': 777,
      });
      const facts = await inspectImage(createReadStream(file), directory);
      expect(facts).toMatchObject({
        format: format.toUpperCase(),
        mime: `image/${format}`,
        width: 16,
        height: 12,
        animated: false,
        pageCount: 1,
      });
      expect(requireFirstImageFormat(facts)).toBe(format);
      expect(await readFile(file)).toEqual(bytes);
    },
  );

  it('rejects a valid single-frame APNG instead of treating its one frame as static PNG', async () => {
    const bytes = singleFrameApng(await raster('png'));
    const { stdout } = await execa(
      'exiftool',
      [
        '-json',
        '-G1',
        '-n',
        '-Validate',
        '-Warning',
        '-PNG:AnimationFrames',
        '-',
      ],
      { input: bytes },
    );
    const native = JSON.parse(stdout)[0];
    expect(native['PNG:AnimationFrames']).toBe(1);
    expect(native['ExifTool:Warning']).toBeUndefined();
    const facts = await inspectImage(Readable.from(bytes), directory);
    expect(facts).toMatchObject({
      format: 'APNG',
      width: 16,
      height: 12,
      animated: true,
    });
    expect(() => requireFirstImageFormat(facts)).toThrow(
      'static JPEG/PNG only',
    );
  });

  it('reads the actual MPF image count from stdin and rejects two-image MPO', async () => {
    const first = await raster('jpeg');
    const second = await raster('jpeg', 'blue');
    const bytes = twoImageMpo(first, second);
    const { stdout } = await execa(
      'exiftool',
      ['-json', '-G1', '-n', '-MPF:NumberOfImages', '-Warning', '-'],
      { input: bytes },
    );
    const native = JSON.parse(stdout)[0];
    expect(native['MPF0:NumberOfImages']).toBe(2);
    expect(native['ExifTool:Warning']).toBeUndefined();
    // The index really resolves to the second JPEG, rather than just declaring count=2.
    const extracted = await execa('exiftool', ['-b', '-MPImage2', '-'], {
      input: bytes,
      encoding: 'buffer',
    });
    expect(Buffer.from(extracted.stdout)).toEqual(second);
    const facts = await inspectImage(Readable.from(bytes), directory);
    expect(facts.pageCount).toBe(2);
    expect(() => requireFirstImageFormat(facts)).toThrow(
      'static JPEG/PNG only',
    );
  });
});
