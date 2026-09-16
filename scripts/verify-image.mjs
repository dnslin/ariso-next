import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { execa } from 'execa';

const fixtures = fileURLToPath(
  new URL('../verification/fixtures/', import.meta.url),
);

// Compare decoded samples, not headers: lossy codecs may change pixels slightly.
export function comparePixels(actual, expected, name) {
  assert.equal(actual.length, expected.length, `${name}: decoded byte count`);
  assert.ok(actual.length > 0, `${name}: empty pixels`);
  let difference = 0;
  let minimum = 255;
  let maximum = 0;
  for (let i = 0; i < actual.length; i++) {
    difference += Math.abs(actual[i] - expected[i]);
    minimum = Math.min(minimum, actual[i]);
    maximum = Math.max(maximum, actual[i]);
  }
  assert.ok(maximum - minimum > 64, `${name}: insufficient pixel variation`);
  const meanError = difference / actual.length;
  assert.ok(meanError < 20, `${name}: mean pixel error ${meanError} >= 20`);
  return meanError;
}

export function checkGlyph(pixels, missing, name) {
  assert.equal(pixels.length, 96 * 96, `${name}: glyph dimensions`);
  const ink = pixels.reduce((count, value) => count + (value < 128 ? 1 : 0), 0);
  assert.ok(
    ink > 20 && ink < pixels.length / 2,
    `${name}: blank or solid glyph (${ink})`,
  );
  assert.notDeepEqual(pixels, missing, `${name}: missing glyph`);
  return ink;
}

async function pixels(path, grayscale = false) {
  const { stdout } = await execa(
    'magick',
    [
      path,
      '-alpha',
      'off',
      '-colorspace',
      grayscale ? 'Gray' : 'sRGB',
      '-depth',
      '8',
      grayscale ? 'gray:-' : 'rgb:-',
    ],
    { encoding: 'buffer' },
  );
  return stdout;
}

async function metadata(path, format, width, height) {
  const { stdout } = await execa('exiftool', [
    '-json',
    '-FileType',
    '-ImageWidth',
    '-ImageHeight',
    path,
  ]);
  const [image] = JSON.parse(stdout);
  assert.equal(image.FileType, format, `${path}: file type`);
  assert.equal(image.ImageWidth, width, `${path}: width`);
  assert.equal(image.ImageHeight, height, `${path}: height`);
  return image;
}

async function render(font, text, path, size = '96x96') {
  await execa('magick', [
    '-size',
    size,
    'xc:white',
    '-font',
    font,
    '-pointsize',
    '48',
    '-fill',
    'black',
    '-gravity',
    'center',
    '-annotate',
    '0',
    text,
    path,
  ]);
}

async function main() {
  const { values } = parseArgs({
    options: { 'output-dir': { type: 'string' } },
  });
  const directory = await mkdtemp(join(tmpdir(), 'ariso-verify-image-'));
  console.log(`Verification temporary directory: ${directory}`);
  try {
    const db = new Database(':memory:');
    let sqlite;
    try {
      sqlite = db
        .prepare('SELECT sqlite_version() AS version, 6 * 7 AS answer')
        .get();
      assert.equal(sqlite.answer, 42);
    } finally {
      db.close();
    }
    const { stdout: magick } = await execa('magick', ['-version']);
    assert.match(magick, /ImageMagick 7\./);
    const { stdout: exiftool } = await execa('exiftool', ['-ver']);
    const report = {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      sqlite,
      magick,
      exiftool,
      conversions: [],
      fonts: [],
    };
    for (const [input, inputFormat] of [
      ['sample.jpg', 'JPEG'],
      ['sample.png', 'PNG'],
    ]) {
      const source = join(fixtures, input);
      await metadata(source, inputFormat, 64, 48);
      const original = await pixels(source);
      assert.equal(original.length, 64 * 48 * 3);
      for (const [extension, format] of [
        ['webp', 'WEBP'],
        ['jpg', 'JPEG'],
        ['avif', 'AVIF'],
      ]) {
        const name = `${input}.${extension}`;
        const output = join(directory, name);
        await execa('magick', [source, '-quality', '90', output]);
        await metadata(output, format, 64, 48);
        const meanError = comparePixels(await pixels(output), original, name);
        report.conversions.push({
          input,
          output: name,
          format,
          width: 64,
          height: 48,
          meanError,
        });
      }
    }
    for (const [name, font, text] of [
      [
        'chinese',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '中文图片验证',
      ],
      [
        'latin',
        '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
        'Ariso 123',
      ],
    ]) {
      const missingPath = join(directory, `${name}-missing.png`);
      // U+10FFFF is a noncharacter: its rendering is the font's missing-glyph control.
      await render(font, '\u{10FFFF}', missingPath);
      const missing = await pixels(missingPath, true);
      const glyphs = [];
      for (const character of new Set(text.replaceAll(' ', ''))) {
        const path = join(
          directory,
          `${name}-${character.codePointAt(0).toString(16)}.png`,
        );
        await render(font, character, path);
        const ink = checkGlyph(
          await pixels(path, true),
          missing,
          `${name}: ${character}`,
        );
        glyphs.push({ character, ink });
      }
      const output = `${name}.png`;
      await render(font, text, join(directory, output), '640x96');
      await metadata(join(directory, output), 'PNG', 640, 96);
      report.fonts.push({ font, text, output, glyphs });
    }
    await writeFile(
      join(directory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (values['output-dir']) {
      const output = values['output-dir'];
      await cp(directory, output, { recursive: true });
      console.log(`Verification samples exported: ${output}`);
    }
    console.log(JSON.stringify(report, null, 2));
    console.log('Image verification passed');
  } finally {
    await rm(directory, { recursive: true, force: true });
    console.log(`Verification temporary directory removed: ${directory}`);
  }
}

if (import.meta.main) await main();
