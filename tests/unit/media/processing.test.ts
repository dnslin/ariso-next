import { expect, it } from 'vitest';
import { startDerivedEncoding } from '../../../src/server/media/processing.ts';
import {
  initialMediaSettings,
  type ProcessingSnapshot,
} from '../../../src/server/media/validation.ts';

it('requires this operation’s compressed result before producing a watermark', async () => {
  const snapshot: ProcessingSnapshot = {
    ...initialMediaSettings,
    watermarkMode: 'text',
    watermarkText: 'Ariso',
    watermarkAsset: null,
  };
  await expect(
    startDerivedEncoding({
      input: 'png:/original.png[0]',
      facts: { format: 'PNG', animated: false },
      kind: 'watermark',
      snapshot,
      workspace: '/workspace',
      signal: new AbortController().signal,
      diskLimitBytes: 128 * 1024 * 1024,
    }),
  ).rejects.toMatchObject({
    code: 'MEDIA_VERSIONS_MISSING',
    message: '本次任务压缩结果尚未生成',
  });
});
