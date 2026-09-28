import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('keeps three missing real services incomplete, preserves previous runs, and never invents cleanup proof', async () => {
  const output = await mkdtemp(join(tmpdir(), 'late-put-runner-'));
  try {
    for (let index = 0; index < 2; index++) {
      const result = spawnSync(
        process.execPath,
        ['tests/experiments/upload-late-put/run.ts', '--output', output],
        { encoding: 'utf8', timeout: 10_000 },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(1);
    }
    const runs = await readdir(output);
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      for (const service of ['aws', 'r2', 'seaweedfs']) {
        const report = JSON.parse(
          await readFile(join(output, run, service, 'report.json'), 'utf8'),
        );
        expect(report).toMatchObject({
          service,
          status: 'incomplete',
          keys: [],
          release: { permitted: false },
          checks: [{ name: 'real-service-environment', status: 'incomplete' }],
        });
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
