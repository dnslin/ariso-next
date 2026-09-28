import assert from 'node:assert/strict';

// Coverage is independent of the manifest so deleting a hard sample cannot pass.
export const requiredFormats = [
  'JPEG',
  'PNG',
  'WEBP',
  'AVIF',
  'BMP',
  'HEIC',
  'TIFF',
  'GIF',
  'ICO',
  'SVG',
];

export function assertCoverage(samples) {
  for (const format of requiredFormats)
    assert.ok(
      samples.some((sample) => sample.expected.format === format),
      `Missing format: ${format}`,
    );
  for (const format of ['PNG', 'WEBP', 'AVIF', 'GIF'])
    assert.ok(
      samples.some(
        (sample) =>
          sample.expected.format === format &&
          sample.expected.classification === 'animation',
      ),
      `Missing animation: ${format}`,
    );
  for (const format of ['HEIC', 'AVIF', 'TIFF', 'ICO'])
    assert.ok(
      samples.some(
        (sample) =>
          sample.expected.format === format && sample.expected.pages > 1,
      ),
      `Missing multiple independent pages: ${format}`,
    );
  for (const format of ['HEIC', 'AVIF'])
    assert.ok(
      samples.some(
        (sample) =>
          sample.expected.format === format &&
          sample.expected.primaryImages === 1 &&
          sample.expected.auxiliaryImages > 0,
      ),
      `Missing auxiliary image: ${format}`,
    );
  assert.ok(
    samples.some(
      (sample) =>
        sample.expected.format === 'GIF' && sample.expected.frames === 1,
    ),
    'Missing static GIF',
  );
  assert.ok(
    samples.some((sample) => sample.expected.defaultImageIsFrame === false),
    'Missing APNG independent poster',
  );
  for (const format of ['HEIC', 'AVIF'])
    assert.ok(
      samples.some(
        (sample) =>
          sample.expected.format === format &&
          sample.expected.nativeTags?.['Meta:Main:PrimaryItemReference'] === 2,
      ),
      `Missing non-first primary image: ${format}`,
    );
  for (const id of ['oriented-heic', 'mirrored-heic', 'offset-gif'])
    assert.ok(
      samples.some((sample) => sample.id === id),
      `Missing edge sample: ${id}`,
    );
  assert.equal(
    new Set(samples.map((sample) => sample.id)).size,
    samples.length,
    'Duplicate sample id',
  );
}

export function assertPixels(bytes, width, height, samples) {
  assert.equal(bytes.length, width * height * 4, 'Decoded RGBA dimensions');
  assert.ok(samples.length > 0, 'Missing expected pixels');
  return samples.map(({ x, y, rgba, tolerance = 20 }) => {
    assert.ok(
      x >= 0 && x < width && y >= 0 && y < height,
      'Pixel outside image',
    );
    const pixel = [
      ...bytes.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
    ];
    for (let channel = 0; channel < 4; channel++) {
      if (channel < 3 && rgba[3] === 0) continue;
      assert.ok(
        Math.abs(pixel[channel] - rgba[channel]) <= tolerance,
        `Pixel ${x},${y}: ${pixel}, expected ${rgba}`,
      );
    }
    return { x, y, rgba: pixel };
  });
}

export async function recordCheck(checks, name, action) {
  try {
    const evidence = await action();
    const status =
      evidence?.status && evidence.status !== 'passed' ? 'failed' : 'passed';
    checks.push({ name, status, evidence });
  } catch (error) {
    checks.push({
      name,
      status: 'failed',
      error: error.message,
      stderr: error.stderr,
    });
  }
}
