import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

it('浏览器证据排除 HTTP/2 签名路径，保留实际 CORS 与内容类型请求头', async () => {
  const output = await mkdtemp(join(tmpdir(), 'browser-evidence-'));
  const origin = 'http://127.0.0.1:47070';
  const source = await readFile(
    new URL('../../experiments/storage-s3/browser.mjs', import.meta.url),
    'utf8',
  );
  const page = {
    goto: vi.fn(),
    snapshot: vi.fn(),
    cdp: vi.fn(),
    events: vi.fn().mockResolvedValue([
      {
        method: 'Network.requestWillBeSent',
        params: { requestId: '1', request: { method: 'PUT' } },
      },
      {
        method: 'Network.requestWillBeSentExtraInfo',
        params: {
          requestId: '1',
          headers: {
            ':path':
              '/object?X-Amz-Credential=test-key&X-Amz-Signature=test-signature',
            ':method': 'PUT',
            Origin: origin,
            'Content-Type': 'image/svg+xml',
          },
        },
      },
    ]),
    evaluate: vi.fn().mockResolvedValue({ status: 200, type: 'cors' }),
    waitForEvent: vi.fn().mockResolvedValue({
      suggestedFilename: () => '旅行.svg',
      saveAs: vi.fn(),
      failure: () => null,
    }),
    click: vi.fn(),
  };
  try {
    // Execute the actual evidence writer with a synthetic CDP trace, without a remote service.
    const execute = new Function(
      'config',
      'taskSpace',
      'console',
      'assert',
      'writeFile',
      `return (async () => {${source.split('\n').slice(2).join('\n')}\n})();`,
    );
    await execute(
      { output, origin, spaceId: 1 },
      async () => ({ page: () => page }),
      {
        log: vi.fn(),
      },
      assert,
      writeFile,
    );
    const raw = await readFile(join(output, 'browser.json'), 'utf8');
    expect(JSON.parse(raw).actualPutHeaders).toEqual([
      { origin, 'content-type': 'image/svg+xml' },
    ]);
    expect(raw).not.toContain('test-key');
    expect(raw).not.toContain('test-signature');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
