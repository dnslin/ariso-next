import { createHash } from 'node:crypto';
import { parse as parseDisposition } from 'content-disposition';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import manifest from '../../fixtures/media-formats/manifest.json';
import { assertCoverage } from '../../experiments/media-formats/checks.mjs';
import { createMediaDeliveryFixture } from './media-fixture.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
});
afterEach(async () => {
  await app?.close();
});
const mimeByFormat: Record<string, string> = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
  AVIF: 'image/avif',
  BMP: 'image/bmp',
  HEIC: 'image/heic',
  TIFF: 'image/tiff',
  GIF: 'image/gif',
  ICO: 'image/x-icon',
  SVG: 'image/svg+xml',
};
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

describe('T-DEL-02 real local original format delivery', () => {
  it('retains the required static, animated, container and auxiliary sample coverage', () => {
    assertCoverage(manifest.samples);
  });

  it.each(manifest.samples)(
    '$id delivers the complete original and uses actual encoding in HTTP metadata',
    async (sample) => {
      const asset = await app.accept(
        `tests/fixtures/media-formats/${sample.file}`,
      );
      const result = app.state(asset.imageId);
      expect(app.job(asset.jobId)).toMatchObject({
        status: 'succeeded',
        error: null,
      });
      expect(result.image).toMatchObject({
        processingStatus: 'ready',
        animated: sample.expected.classification === 'animation',
        pageCount: sample.expected.pages ?? sample.expected.frames ?? 1,
      });
      expect(digest(asset.bytes)).toBe(sample.sha256);
      const expectedMime = mimeByFormat[sample.expected.format];
      const extension =
        sample.expected.format === 'JPEG'
          ? 'jpg'
          : sample.expected.format.toLowerCase();
      for (const query of ['?type=original', '?type=original&download=1']) {
        const response = await app.request(asset.imageId, query);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-ariso-image-version')).toBe('original');
        expect(response.headers.get('content-type')).toBe(expectedMime);
        expect(response.headers.get('content-length')).toBe(
          String(asset.bytes.length),
        );
        expect(response.headers.get('cache-control')).toBe(
          'private, no-store, no-transform',
        );
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        const disposition = parseDisposition(
          response.headers.get('content-disposition')!,
        );
        expect(disposition.parameters.filename).toBe(`原始文件.${extension}`);
        expect(disposition.type).toBe(
          query.includes('download') || sample.expected.format === 'SVG'
            ? 'attachment'
            : 'inline',
        );
        const delivered = Buffer.from(await response.arrayBuffer());
        expect(delivered).toEqual(asset.bytes);
        // Matching the licensed full-file digest retains every animation frame,
        // page, auxiliary item and original metadata, rather than just a preview.
        expect(digest(delivered)).toBe(sample.sha256);
      }
      const head = await app.request(asset.imageId, '?type=original', {
        method: 'HEAD',
      });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-type')).toBe(expectedMime);
      expect(head.headers.get('content-length')).toBe(
        String(asset.bytes.length),
      );
      expect(await head.text()).toBe('');
      for (const defaultLinkVersion of ['compressed', 'watermark'] as const) {
        patchMediaSettings(app.db, {
          defaultLinkVersion,
          watermarkMode: 'text',
          watermarkText: 'A',
          watermarkFont: 'latin',
        });
        const response = await app.request(asset.imageId);
        const inapplicable = sample.expected.classification !== 'static';
        if (inapplicable) {
          expect(response.status).toBe(200);
          expect(response.headers.get('x-ariso-image-version')).toBe(
            'original',
          );
          expect(digest(Buffer.from(await response.arrayBuffer()))).toBe(
            sample.sha256,
          );
        } else if (defaultLinkVersion === 'compressed') {
          expect(response.status).toBe(200);
          expect(response.headers.get('x-ariso-image-version')).toBe(
            'compressed',
          );
          await response.arrayBuffer();
        } else {
          // Applicable, but absent: changing defaults must not create a version.
          expect(response.status).toBe(404);
          expect(await response.json()).toMatchObject({
            code: 'VERSION_UNAVAILABLE',
          });
        }
        if (inapplicable || defaultLinkVersion === 'watermark') {
          const explicit = await app.request(
            asset.imageId,
            `?type=${defaultLinkVersion}`,
          );
          expect(explicit.status).toBe(404);
          expect(await explicit.json()).toMatchObject({
            code: 'VERSION_UNAVAILABLE',
          });
        }
      }
    },
  );
});
