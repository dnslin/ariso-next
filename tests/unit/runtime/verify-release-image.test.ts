import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn());
vi.mock('execa', () => ({ execa: run }));
import { verifyReleaseImage } from '../../../scripts/verify-release-image.mjs';
import { assertPersistedImage } from '../../../scripts/verify-container.mjs';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-release-test-'));
  run.mockReset().mockResolvedValue({ stdout: 'verified', stderr: '' });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe('shared release image verification', () => {
  it('verifies the same selected image offline, then uses the existing media and lifecycle verifiers', async () => {
    const report = await verifyReleaseImage({
      image: 'ariso:preflight',
      platform: 'linux/arm64',
      outputDir: directory,
    });
    expect(report.status).toBe('passed');
    expect(run).toHaveBeenCalledTimes(3);
    for (const [command, args] of run.mock.calls.slice(0, 2)) {
      expect(command).toBe('docker');
      expect(args).toEqual(
        expect.arrayContaining([
          '--platform',
          'linux/arm64',
          '--network',
          'none',
          '--read-only',
          'ariso:preflight',
        ]),
      );
    }
    expect(run.mock.calls[1][1].at(-1)).toContain(
      'node /app/scripts/verify-image.mjs --output-dir',
    );
    const mediaArgs = run.mock.calls[1][1];
    expect(mediaArgs[mediaArgs.indexOf('--workdir') + 1]).toBe('/app');
    expect(mediaArgs[mediaArgs.indexOf('--tmpfs') + 1]).toBe('/tmp');
    expect(run.mock.calls[1][1].at(-1)).toContain('ariso-verify-image-*');
    expect(run.mock.calls[2][0]).toBe(process.execPath);
    expect(run.mock.calls[2][1]).toEqual([
      expect.stringMatching(/scripts\/verify-container\.mjs$/),
      '--image',
      'ariso:preflight',
      '--platform',
      'linux/arm64',
      '--output-dir',
      join(directory, 'container'),
    ]);
    expect(
      JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')).status,
    ).toBe('passed');
    expect(await readFile(join(directory, 'baseline.log'), 'utf8')).toContain(
      'verified',
    );
  });

  it('stops at a failed production check and preserves the failure in evidence', async () => {
    run.mockRejectedValueOnce(new Error('native SQLite failed'));
    await expect(
      verifyReleaseImage({
        image: 'ariso:broken',
        platform: 'linux/amd64',
        outputDir: directory,
      }),
    ).rejects.toThrow('native SQLite failed');
    expect(run).toHaveBeenCalledTimes(1);
    expect(await readFile(join(directory, 'baseline.log'), 'utf8')).toContain(
      'native SQLite failed',
    );
    expect(
      JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')),
    ).toMatchObject({
      status: 'failed',
      error: 'native SQLite failed',
      checks: [],
    });
  });
});

describe('real uploaded image persistence verification', () => {
  const bytes = Buffer.from([1, 2, 3, 4]);
  function responses({
    imageId = 'image-1',
    status = 'ready',
    original = bytes,
  } = {}) {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          total: 1,
          items: [{ id: imageId, processingStatus: status }],
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(original)));
    vi.stubGlobal('fetch', request);
    return request;
  }
  it('checks the authenticated library and exact anonymously delivered original bytes', async () => {
    const request = responses();
    await assertPersistedImage(
      'http://localhost:3000',
      'owner=session',
      'image-1',
      bytes,
    );
    expect(request.mock.calls[0][1].headers).toEqual({
      cookie: 'owner=session',
    });
    expect(request.mock.calls[1][0]).toBe(
      'http://localhost:3000/i/image-1?type=original',
    );
    expect(request.mock.calls[1][1].headers).toBeUndefined();
  });
  it('rejects a different record instead of accepting any remaining library image', async () => {
    responses({ imageId: 'replacement' });
    await expect(
      assertPersistedImage(
        'http://localhost:3000',
        'owner=session',
        'image-1',
        bytes,
      ),
    ).rejects.toThrow('identity persists');
  });
  it('rejects an unfinished job despite an existing library record', async () => {
    responses({ status: 'processing' });
    await expect(
      assertPersistedImage(
        'http://localhost:3000',
        'owner=session',
        'image-1',
        bytes,
      ),
    ).rejects.toThrow();
  });
  it('rejects replaced original bytes despite a successful HTTP response', async () => {
    responses({ original: Buffer.from([4, 3, 2, 1]) });
    await expect(
      assertPersistedImage(
        'http://localhost:3000',
        'owner=session',
        'image-1',
        bytes,
      ),
    ).rejects.toThrow();
  });
});
