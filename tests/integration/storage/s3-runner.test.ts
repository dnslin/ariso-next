import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('preserves cleanup evidence across repeated runs using the same output root', async () => {
  const output = await mkdtemp(join(tmpdir(), 'storage-s3-runner-'));
  const previousReport = join(output, 'aws', 'report.json');
  const evidence = JSON.stringify({
    status: 'failed',
    keys: ['ariso/ev-storage-01/previous-run/orphan.svg'],
  });
  try {
    await mkdir(join(output, 'aws'));
    await writeFile(previousReport, evidence);
    const run = () => {
      const result = spawnSync(
        process.execPath,
        ['tests/experiments/storage-s3/run.ts', '--output', output],
        { encoding: 'utf8', timeout: 10_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(1);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(3);
      return lines.map((line) => {
        expect(line).toMatch(/^(aws|seaweedfs|r2): incomplete; /);
        return line.split('; ')[1];
      });
    };
    const firstPaths = run();
    expect(await readFile(previousReport, 'utf8')).toBe(evidence);
    const firstReports = await Promise.all(
      firstPaths.map((path) => readFile(path, 'utf8')),
    );
    const secondPaths = run();
    expect(new Set([...firstPaths, ...secondPaths]).size).toBe(6);
    expect(await readFile(previousReport, 'utf8')).toBe(evidence);
    expect(
      await Promise.all(firstPaths.map((path) => readFile(path, 'utf8'))),
    ).toEqual(firstReports);
    for (const path of [...firstPaths, ...secondPaths]) {
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
        status: 'incomplete',
        keys: [],
      });
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
