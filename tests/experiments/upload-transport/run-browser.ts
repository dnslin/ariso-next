import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createTransportLab } from './lab.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(spaceId, 'Reuse the task Ego space via EGO_TASK_SPACE');
const output = resolve('test-results/upload-browser');
await mkdir(output, { recursive: true });
const lab = await createTransportLab({ waitMs: 1500 });
try {
  const source = await readFile(
    new URL('./browser.mjs', import.meta.url),
    'utf8',
  );
  const child = promisify(execFile)('ego-browser', ['nodejs'], {
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
  });
  child.child.stdin!.end(
    `const config = ${JSON.stringify({ spaceId, url: lab.url, output })};\n${source}`,
  );
  await child;
  const result = JSON.parse(await readFile(`${output}/browser.json`, 'utf8'));
  assert.equal(result.limits.maxBytes, 52_428_800);
  assert.equal(result.exact.status, 201);
  assert.equal(result.exact.body.bytes, 52_428_800);
  assert.equal(result.over.status, 413);
  assert.equal(result.wait.status, 504);
  assert.equal(result.shortXhrTimeout, 'timeout');
  assert.equal(lab.job.status, 'processing');
  await writeFile(
    `${output}/server.json`,
    JSON.stringify(
      {
        receptions: lab.receptions,
        job: lab.job,
        scope:
          'Browser and isolated HTTP proxy; no production UI or actual media task',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Browser experiment passed: ${output}`);
} finally {
  await lab.close();
}
