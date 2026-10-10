import assert from 'node:assert/strict';

/** Run one business scene, isolating the two upload authentication prerequisites. */
export async function runBusinessBrowserStage({
  check,
  runBrowser,
  restart,
  config,
  script,
  name = script,
  dependencies = /** @type {string[]} */ ([]),
}) {
  if (script === 'upload' || script === 'upload-polling') {
    const runtime = `${script}-runtime`;
    await check(
      runtime,
      async () => assert.deepEqual(await restart(config.dataDirectory), []),
      dependencies,
    );
    dependencies = [...dependencies, runtime];
  }
  const passed = await check(
    name,
    () => runBrowser(`../e2e/${script}.mjs`, config, `${name}.log`),
    dependencies,
  );
  if (
    script !== 'site-branding' ||
    (config.siteBrandingPhase !== undefined &&
      config.siteBrandingPhase !== 'consumers')
  )
    return passed;
  const restarted = await check(
    `${name}-restart`,
    async () => {
      assert.deepEqual(
        await restart(config.dataDirectory),
        [],
        'Initialized branding restart must not issue setup codes',
      );
      await runBrowser(
        '../e2e/site-branding-restart.mjs',
        config,
        `${name}-restart.log`,
      );
    },
    [name],
  );
  return passed && restarted;
}
