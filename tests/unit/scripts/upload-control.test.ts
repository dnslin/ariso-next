import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function execute(boundary: string, message: string) {
  const output = await mkdtemp(join(tmpdir(), 'ariso-upload-control-'));
  directories.push(output);
  const { stdout } = await run(process.execPath, [
    'tests/fixtures/browser/upload-control.mjs',
    output,
    boundary,
    message,
  ]);
  return JSON.parse(stdout);
}

describe('actual upload entry control boundary', () => {
  it.each(['owner', 'transport'])(
    'stops every browser call after %s loses control',
    async (boundary) => {
      const result = await execute(boundary, 'user has taken control');
      expect(result.originalError).toBe(true);
      expect(result.afterStop).toEqual([]);
      expect(result.report.status).toBe('failed');
      expect(result.report.stoppedForUserControl).toBe(true);
      if (boundary === 'transport')
        expect(result.report.pendingBrowserCleanup).toEqual({
          scriptIdentifier: 'upload-transport',
        });
    },
  );

  it('retains diagnostics and original error on an ordinary owner failure', async () => {
    const result = await execute('owner', 'ordinary browser failure');
    expect(result.originalError).toBe(true);
    expect(result.afterStop).toContain('snapshot');
    expect(result.report.page).toBe('offline snapshot');
    expect(result.report.stoppedForUserControl).not.toBe(true);
  });
});
