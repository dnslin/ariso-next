import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMeasurement } from '../../experiments/media-basic/resources.mjs';

describe('media experiment measurements', () => {
  it('records actual overlapping subprocesses and settles failed commands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'media-measurement-'));
    try {
      const commands: { file: string; args: string[]; durationMs: number }[] =
        [];
      const { run, measure } = createMeasurement(directory, commands);
      const evidence = await measure('overlap', () =>
        Promise.all([
          run(process.execPath, [
            '-e',
            'setTimeout(() => console.log("one"), 150)',
          ]),
          run(process.execPath, [
            '-e',
            'setTimeout(() => console.log("two"), 150)',
          ]),
        ]),
      );
      expect(
        evidence.result.map((result: { stdout: string }) => result.stdout),
      ).toEqual(['one', 'two']);
      expect(
        evidence.curve.some(
          (sample: { active: number }) => sample.active === 2,
        ),
      ).toBe(true);
      expect(evidence.curve.at(-1)?.active).toBe(0);
      await expect(
        measure('failure', () =>
          run(process.execPath, ['-e', 'process.exit(7)']),
        ),
      ).rejects.toMatchObject({
        exitCode: 7,
        measurement: {
          name: 'failure',
          curve: expect.arrayContaining([
            expect.objectContaining({ active: 0 }),
          ]),
        },
      });
      expect(commands).toHaveLength(3);
      expect(commands.every((command) => command.durationMs > 0)).toBe(true);
      const settled = await measure('after-failure', async () => 'ready');
      expect(
        settled.curve.every(
          (sample: { active: number }) => sample.active === 0,
        ),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
