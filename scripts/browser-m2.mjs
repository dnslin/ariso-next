import assert from 'node:assert/strict';

/**
 * The after scene consumes the job persisted by before in the same DATA_DIR.
 * @param {{
 *   check: (name: string, operation: () => Promise<void>, dependencies?: string[]) => Promise<boolean>,
 *   runBrowser: (script: string, config: Record<string, unknown>, log: string) => Promise<void>,
 *   restart: (dataDirectory: string) => Promise<string[]>,
 *   config: { width: number, dataDirectory: string },
 *   dependencies?: string[]
 * }} options
 */
export async function runM2Restart({
  check,
  runBrowser,
  restart,
  config,
  dependencies = [],
}) {
  const before = `m2-${config.width}-before`;
  const after = `m2-${config.width}-after`;
  await check(
    before,
    () =>
      runBrowser(
        '../e2e/m2.mjs',
        { ...config, phase: 'before' },
        `${before}.log`,
      ),
    dependencies,
  );
  await check(after, async () => {
    assert.deepEqual(
      await restart(config.dataDirectory),
      [],
      'Initialized restart must not issue another code',
    );
    await runBrowser(
      '../e2e/m2.mjs',
      { ...config, phase: 'after' },
      `${after}.log`,
    );
  }, [before]);
}
