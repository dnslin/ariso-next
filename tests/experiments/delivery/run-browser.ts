import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { launchDelivery } from './harness.ts';
assert.equal(process.versions.node.split('.')[0], '24');
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(spaceId, 'Reuse the task Ego space via EGO_TASK_SPACE');
const output = resolve('test-results/delivery-browser');
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error('Delivery browser experiment interrupted'));
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let app: Awaited<ReturnType<typeof launchDelivery>> | undefined;
try {
  app = await launchDelivery(controller.signal);
  controller.signal.throwIfAborted();
  await mkdir(output, { recursive: true });
  await app.control('browser', {
    size: (await stat(join(app.objects, 'sample'))).size,
  });
  await app.control('svg', {
    objectId: 'svg',
    size: (await stat(join(app.objects, 'svg'))).size,
    contentType: 'image/svg+xml',
    extension: 'svg',
    displayName: '旅行.svg',
  });
  const source = await readFile(
    'tests/experiments/delivery/browser.mjs',
    'utf8',
  );
  const browser = promisify(execFile)('ego-browser', ['nodejs'], {
    signal: controller.signal,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  browser.child.stdin!.end(
    `const config = ${JSON.stringify({ spaceId, origin: app.origin, output })};\n${source}`,
  );
  const result = await browser;
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  assert.deepEqual(
    await readFile(join(output, '旅行.final.png')),
    await readFile(join(app.objects, 'sample')),
  );
  assert.deepEqual(
    await readFile(join(output, '旅行.svg')),
    await readFile(join(app.objects, 'svg')),
  );
  await writeFile(
    join(output, 'server-probes.json'),
    JSON.stringify(
      { browser: await app.probe('browser'), svg: await app.probe('svg') },
      null,
      2,
    ),
  );
} finally {
  if (app) {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'server.log'), app.logs());
    await app.stop();
  }
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
