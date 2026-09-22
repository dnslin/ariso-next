import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, limits } from './resources.mjs';

const colors = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
];

export async function verifyImages({ sourceDirectory, outputDirectory, run }) {
  const magick = (args, options) =>
    run('magick', [...limits(0), ...args], options);
  async function inspect(path) {
    const { stdout } = await run('exiftool', [
      '-json',
      '-n',
      '-FileType',
      '-MIMEType',
      '-ImageWidth',
      '-ImageHeight',
      '-Orientation',
      '-Artist',
      path,
    ]);
    return JSON.parse(stdout)[0];
  }
  async function describe(path) {
    return { path, bytes: (await stat(path)).size, sha256: await hash(path) };
  }
  async function sample(path, width, height, channels = 'rgb') {
    const samples = [];
    for (const [x, y] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ]) {
      const { stdout } = await magick(
        [
          path,
          '-crop',
          `1x1+${Math.floor(width * x)}+${Math.floor(height * y)}`,
          '+repage',
          '-depth',
          '8',
          `${channels}:-`,
        ],
        { encoding: 'buffer' },
      );
      assert.equal(
        stdout.length,
        channels.length,
        `${path}: decoded sample size`,
      );
      samples.push([...stdout]);
    }
    return samples;
  }
  async function convert(
    source,
    name,
    width,
    height,
    expected,
    extra = [],
    alpha = false,
  ) {
    const before = await describe(source);
    const path = join(outputDirectory, name);
    const result = await magick([
      source,
      '-auto-orient',
      '-colorspace',
      'sRGB',
      '-resize',
      '640x640>',
      ...extra,
      '-strip',
      '-quality',
      '80',
      path,
    ]);
    const metadata = await inspect(path);
    assert.equal(
      metadata.FileType,
      name.endsWith('.jpg') ? 'JPEG' : alpha ? 'Extended WEBP' : 'WEBP',
    );
    assert.equal(
      metadata.MIMEType,
      name.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
    );
    assert.equal(metadata.ImageWidth, width);
    assert.equal(metadata.ImageHeight, height);
    const { stdout } = await run('exiftool', [
      '-json',
      '-EXIF:all',
      '-XMP:all',
      '-IPTC:all',
      '-ICC_Profile:all',
      path,
    ]);
    assert.deepEqual(
      Object.keys(JSON.parse(stdout)[0]),
      ['SourceFile'],
      'Metadata must be stripped',
    );
    const { stdout: colorSpace } = await magick([
      path,
      '-format',
      '%[colorspace]',
      'info:',
    ]);
    assert.equal(colorSpace, 'sRGB');
    const actual = await sample(path, width, height, alpha ? 'rgba' : 'rgb');
    if (alpha)
      assert.deepEqual(
        actual.map((pixel) => pixel[3]),
        expected.map((pixel) => pixel[3]),
      );
    const errors = actual.map((pixel, index) => {
      // RGB under fully transparent pixels is not visually meaningful.
      const difference = Math.max(
        ...pixel.map((value, channel) =>
          alpha && expected[index][3] === 0 && channel < 3
            ? 0
            : Math.abs(value - expected[index][channel]),
        ),
      );
      assert.ok(
        difference < 20,
        `${name}: quadrant ${index} pixel ${pixel}, expected ${expected[index]}`,
      );
      return difference;
    });
    assert.equal(
      await hash(source),
      before.sha256,
      `${source}: original unchanged`,
    );
    return {
      source: before,
      derivative: await describe(path),
      durationMs: result.durationMs,
      format: metadata.FileType,
      colorSpace,
      width,
      height,
      samples: actual,
      maximumChannelErrors: errors,
      metadataStripped: true,
    };
  }
  const cases = [];
  for (const [name, width, height, orientation, expected] of [
    ['rotate.jpg', 1200, 800, 6, [colors[2], colors[0], colors[3], colors[1]]],
    ['mirror.jpg', 1200, 800, 2, [colors[1], colors[0], colors[3], colors[2]]],
    ['rotate.png', 1200, 800, 6, [colors[2], colors[0], colors[3], colors[1]]],
    ['small.png', 120, 80, 1, colors],
  ]) {
    const source = join(sourceDirectory, name);
    await magick([
      '-size',
      `${width}x${height}`,
      'xc:red',
      '-fill',
      '#00ff00',
      '-draw',
      `rectangle ${width / 2},0 ${width - 1},${height / 2 - 1}`,
      '-fill',
      'blue',
      '-draw',
      `rectangle 0,${height / 2} ${width / 2 - 1},${height - 1}`,
      '-fill',
      'yellow',
      '-draw',
      `rectangle ${width / 2},${height / 2} ${width - 1},${height - 1}`,
      '-quality',
      '95',
      source,
    ]);
    await run('exiftool', [
      '-overwrite_original',
      `-Orientation#=${orientation}`,
      '-Artist=Ariso generated fixture',
      source,
    ]);
    const original = await inspect(source);
    assert.equal(original.FileType, name.endsWith('.jpg') ? 'JPEG' : 'PNG');
    assert.equal(
      original.Orientation,
      orientation,
      'Fixture carries real EXIF orientation',
    );
    assert.equal(original.Artist, 'Ariso generated fixture');
    assert.equal(original.ImageWidth, width);
    assert.equal(original.ImageHeight, height);
    cases.push({
      orientation,
      ...(await convert(
        source,
        `${name}.webp`,
        orientation === 6 ? 427 : Math.min(640, width),
        orientation === 6 ? 640 : Math.min(427, height),
        expected,
      )),
    });
  }
  const transparent = join(sourceDirectory, 'transparent.png');
  await magick([
    '-size',
    '120x80',
    'xc:none',
    '-fill',
    'red',
    '-draw',
    'rectangle 0,0 59,79',
    transparent,
  ]);
  const transparentSamples = await sample(transparent, 120, 80, 'rgba');
  assert.deepEqual(
    transparentSamples.map((pixel) => pixel[3]),
    [255, 0, 255, 0],
  );
  cases.push(
    await convert(
      transparent,
      'transparent.webp',
      120,
      80,
      [
        [255, 0, 0, 255],
        [0, 0, 0, 0],
        [255, 0, 0, 255],
        [0, 0, 0, 0],
      ],
      [],
      true,
    ),
  );
  cases.push(
    await convert(
      transparent,
      'background.jpg',
      120,
      80,
      [colors[0], [240, 240, 240], colors[0], [240, 240, 240]],
      ['-background', '#f0f0f0', '-alpha', 'remove', '-alpha', 'off'],
    ),
  );
  return {
    fixtureLicense:
      'Generated by this repository from solid colors; no external media or license dependencies.',
    scope:
      'JPEG/PNG basic pipeline only; this is not the complete EV-02 format acceptance suite.',
    cases,
  };
}
