import manifest from '../../fixtures/media-formats/manifest.json';
import { describe, expect, it } from 'vitest';
import {
  assertCoverage,
  assertPixels,
} from '../../experiments/media-formats/checks.mjs';

describe('format experiment evidence assertions', () => {
  it('refuses empty format coverage instead of reporting a vacuous pass', () => {
    expect(() => assertCoverage([])).toThrow('Missing format: JPEG');
  });
  it('rejects a valid-sized preview containing the wrong first frame', () => {
    expect(() =>
      assertPixels(Buffer.from([0, 0, 255, 255]), 1, 1, [
        { x: 0, y: 0, rgba: [255, 0, 0, 255] },
      ]),
    ).toThrow('Pixel');
  });
  it('accepts decoded pixels within codec error and requires the full canvas', () => {
    expect(
      assertPixels(Buffer.from([250, 3, 2, 255]), 1, 1, [
        { x: 0, y: 0, rgba: [255, 0, 0, 255] },
      ]),
    ).toHaveLength(1);
    expect(() =>
      assertPixels(Buffer.alloc(0), 1, 1, [
        { x: 0, y: 0, rgba: [255, 0, 0, 255] },
      ]),
    ).toThrow('dimensions');
    expect(() => assertPixels(Buffer.from([255, 0, 0, 255]), 1, 1, [])).toThrow(
      'Missing expected pixels',
    );
  });
});

it('never records blocked evidence or thrown checks as passed', async () => {
  const { recordCheck } =
    await import('../../experiments/media-formats/checks.mjs');
  const checks: { status: string; evidence?: unknown; error?: string }[] = [];
  await recordCheck(checks, 'unsupported', async () => ({
    status: 'blocked',
    reason: 'missing decoder',
  }));
  await recordCheck(checks, 'failed', async () => {
    throw new Error('wrong pixels');
  });
  expect(checks).toMatchObject([
    {
      status: 'failed',
      evidence: { status: 'blocked', reason: 'missing decoder' },
    },
    { status: 'failed', error: 'wrong pixels' },
  ]);
});

it('requires the complete checked-in corpus including independent APNG poster and non-first primary images', () => {
  expect(() => assertCoverage(manifest.samples)).not.toThrow();
  expect(() =>
    assertCoverage(
      manifest.samples.filter((sample) => sample.id !== 'poster-png'),
    ),
  ).toThrow('independent poster');
  expect(() =>
    assertCoverage(
      manifest.samples.filter((sample) => sample.id !== 'primary-second-heic'),
    ),
  ).toThrow('non-first primary');
});
