import assert from 'node:assert/strict';

// These scenes own authentication prerequisites independently of prior suites.
export async function runUploadBrowserStage({
  check,
  runBrowser,
  restart,
  config,
  script,
  dependencies = /** @type {string[]} */ ([]),
}) {
  assert.ok(['upload', 'upload-polling'].includes(script));
  const runtime = `${script}-runtime`;
  await check(
    runtime,
    async () => assert.deepEqual(await restart(config.dataDirectory), []),
    dependencies,
  );
  return check(
    script,
    () => runBrowser(`../e2e/${script}.mjs`, config, `${script}.log`),
    [...dependencies, runtime],
  );
}
