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
  return check(
    name,
    () => runBrowser(`../e2e/${script}.mjs`, config, `${name}.log`),
    dependencies,
  );
}
