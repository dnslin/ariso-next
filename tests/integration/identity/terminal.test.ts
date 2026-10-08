import { expect, it } from 'vitest';
import { startTerminal } from '../../../scripts/terminal.ts';

const options = { env: { PATH: process.env.PATH } };

it('drives both prompts in order and drains final output before returning status', async () => {
  const run = startTerminal(
    [
      process.execPath,
      '-e',
      `
      process.stdout.write('first prompt:');
      process.stdin.once('data', () => {
        process.stdout.write('second prompt:');
        process.stdin.once('data', () => {
          process.stdout.write('finished');
          process.exit(7);
        });
      });
    `,
    ],
    options,
  );
  try {
    await run.waitFor('first prompt:');
    run.write('first\r');
    await run.waitFor('second prompt:');
    run.write('second\r');
    expect(await run.result).toEqual({ exitCode: 7, terminalRestored: true });
    expect(run.output()).toContain('finished');
    await expect(run.waitFor('missing prompt')).rejects.toThrow(
      'PTY exited before prompt',
    );
  } finally {
    await run.stop();
  }
});

it('preserves harness failure for prompt, result and cleanup instead of hanging', async () => {
  const run = startTerminal(['/ariso-test-command-does-not-exist'], options);
  await expect(run.waitFor('missing prompt')).rejects.toMatchObject({
    exitCode: 1,
  });
  await expect(run.result).rejects.toMatchObject({ exitCode: 1 });
  await expect(run.stop()).rejects.toMatchObject({ exitCode: 1 });
});

it('stop closes input, reaps the terminal child and can be called again', async () => {
  const run = startTerminal(
    [
      process.execPath,
      '-e',
      `console.log('pid:' + process.pid); setInterval(() => {}, 1000);`,
    ],
    options,
  );
  try {
    await run.waitFor('pid:');
    const pid = Number(run.output().match(/pid:(\d+)/)![1]);
    await run.stop();
    expect(await run.result).toEqual({ exitCode: -15, terminalRestored: true });
    expect(() => process.kill(pid, 0)).toThrowError(
      expect.objectContaining({ code: 'ESRCH' }),
    );
    await run.stop();
  } finally {
    await run.stop();
  }
});

it('cancellation settles the result and reaps the actual terminal child', async () => {
  const abort = new AbortController();
  const run = startTerminal(
    [
      process.execPath,
      '-e',
      `console.log('pid:' + process.pid); setInterval(() => {}, 1000);`,
    ],
    { ...options, cancelSignal: abort.signal },
  );
  let pid: number | undefined;
  try {
    await run.waitFor('pid:');
    pid = Number(run.output().match(/pid:(\d+)/)![1]);
    abort.abort(new Error('terminal verification cancelled'));
    await expect(run.result).rejects.toMatchObject({ isCanceled: true });
    expect(() => process.kill(pid!, 0)).toThrowError(
      expect.objectContaining({ code: 'ESRCH' }),
    );
  } finally {
    // The failing baseline must not leave its test child behind.
    if (pid) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    await expect(run.stop()).rejects.toMatchObject({ isCanceled: true });
  }
});
