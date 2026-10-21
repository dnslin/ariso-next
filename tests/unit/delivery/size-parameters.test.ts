import { expect, it } from 'vitest';
import {
  buildImageLinks,
  buildImagePath,
  parseImageRequest,
} from '../../../src/server/delivery/links.ts';

it('accepts only fixed compressed/watermark presets and preserves the unchanged original/default contracts', () => {
  for (const query of [
    'preset=medium',
    'type=original&preset=medium',
    'type=thumbnail&preset=small',
    'type=compressed&preset=',
    'type=compressed&preset=unknown',
    'type=compressed&preset=small&preset=large',
  ])
    expect(() => parseImageRequest('one', new URLSearchParams(query))).toThrow(
      expect.objectContaining({ code: 'INVALID_IMAGE_REQUEST' }),
    );
  for (const kind of ['compressed', 'watermark'] as const)
    for (const preset of ['small', 'medium', 'large'] as const) {
      expect(
        parseImageRequest(
          'one',
          new URLSearchParams(`type=${kind}&preset=${preset}`),
        ),
      ).toMatchObject({ selectedVersion: kind, preset });
      expect(buildImagePath('one', kind, false, preset)).toBe(
        `/i/one?type=${kind}&preset=${preset}`,
      );
    }
  const links = buildImageLinks(
    'https://ariso.test',
    'one',
    '旅行',
    'watermark',
    'medium',
  );
  expect(links.url).toBe(
    'https://ariso.test/i/one?type=watermark&preset=medium',
  );
  expect(links.markdown).toContain(links.url);
  expect(links.html).toContain('type=watermark&amp;preset=medium');
});
