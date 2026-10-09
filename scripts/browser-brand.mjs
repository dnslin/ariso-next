import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startBrandFixture } from '../tests/experiments/site-branding/lab.ts';

/** Owns only the branding fixture; the shared runner owns the Ego process/space. */
export async function runBrandBrowser({
  spaceId,
  pageLabel,
  output,
  runBrowser,
  signal,
}) {
  const root = await mkdtemp(join(tmpdir(), 'ariso-brand-browser-'));
  let fixture;
  try {
    signal.throwIfAborted();
    fixture = await startBrandFixture(root);
    const samples = [];
    for (const [file, format, mime, width, height] of [
      ['source.png', 'PNG', 'image/png', 64, 48],
      ['static.jpg', 'JPEG', 'image/jpeg', 64, 48],
      ['static.webp', 'WEBP', 'image/webp', 64, 48],
      ['multiple.ico', 'ICO', 'image/x-icon', 64, 64],
      ['static.svg', 'SVG', 'image/svg+xml', 64, 48],
    ])
      samples.push({
        format,
        mime,
        width,
        height,
        data: (
          await readFile(resolve('tests/fixtures/media-formats', file))
        ).toString('base64'),
      });
    await runBrowser(
      '../tests/experiments/site-branding/browser.mjs',
      {
        spaceId,
        pageLabel,
        origin: fixture.origin,
        output,
        samples,
      },
      'brand-experiment.log',
    );
    assert.ok(!fixture.requests.includes('/script-canary'));
    assert.ok(!fixture.requests.includes('/external-canary'));
  } finally {
    await fixture?.close();
    await rm(root, { recursive: true, force: true });
  }
}
