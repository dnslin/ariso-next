import { describe, expect, it } from 'vitest';
import {
  reprocessInputSchema,
  reprocessVersions,
} from '../../../src/server/media/reprocess.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';

describe('reprocessing targets', () => {
  it('defaults to all and rejects unknown fields and ranges', () => {
    expect(reprocessInputSchema.parse({})).toEqual({ scope: 'all' });
    expect(() => reprocessInputSchema.parse({ scope: 'original' })).toThrow();
    expect(() => reprocessInputSchema.parse({ quality: 50 })).toThrow();
  });
  it('all targets only applicable enabled versions', () => {
    expect(reprocessVersions('all', 'static', initialMediaSettings)).toEqual([
      'compressed',
      'thumbnail',
    ]);
    expect(reprocessVersions('all', 'animated', initialMediaSettings)).toEqual([
      'thumbnail',
    ]);
    expect(
      reprocessVersions('all', 'static', {
        ...initialMediaSettings,
        compressionEnabled: false,
        watermarkMode: 'text',
      }),
    ).toEqual(['thumbnail', 'watermark']);
  });
  it('only watermark does not select intermediate compression for publication', () => {
    expect(
      reprocessVersions('watermark', 'static', initialMediaSettings),
    ).toEqual(['watermark']);
  });
});
