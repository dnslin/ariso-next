import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    credentials: { type: 'string' },
    'r2-no-lock-evidence': { type: 'string' },
    origin: { type: 'string', default: 'http://127.0.0.1:47070' },
    output: { type: 'string', default: 'test-results/storage-cors-live' },
  },
});
assert.ok(
  values.config && values.credentials,
  '--config and --credentials must identify existing private test-only files',
);
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(Number.isInteger(spaceId) && spaceId > 0, 'Reuse EGO_TASK_SPACE');
const targets = JSON.parse(await readFile(values.config, 'utf8')).filter(
  (target) => ['r2', 'seaweedfs'].includes(target.service),
);
assert.deepEqual(targets.map((target) => target.service).sort(), [
  'r2',
  'seaweedfs',
]);
const credentials = JSON.parse(await readFile(values.credentials, 'utf8'));
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const config = {
  spaceId,
  origin: values.origin,
  credentials,
  corsTargets: targets,
  r2NoLockEvidence: values['r2-no-lock-evidence'],
  output,
};
const secrets = [
  credentials.password,
  ...targets.flatMap((target) => Object.values(target.credentials)),
];
const redact = (value) => {
  let safe = String(value);
  for (const secret of secrets)
    if (secret) safe = safe.replaceAll(secret, '[redacted]');
  return safe.replace(
    /https?:[^\s"<>]*X-Amz-[^\s"<>]*/gi,
    '[signed URL redacted]',
  );
};
const report = {
  status: 'failed',
  origin: config.origin,
  taskSpaceId: spaceId,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  services: [],
};
try {
  const browser = spawn('ego-browser', ['nodejs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let logs = '';
  browser.stdout.on('data', (data) => {
    logs += data;
  });
  browser.stderr.on('data', (data) => {
    logs += data;
  });
  const closed = once(browser, 'close');
  browser.stdin.end(
    `const config = ${JSON.stringify(config)};\n${await readFile(resolve('e2e/storage-cors.mjs'), 'utf8')}`,
  );
  const timer = setTimeout(() => browser.kill('SIGTERM'), 240000);
  let exitCode;
  try {
    [exitCode] = await closed;
  } finally {
    clearTimeout(timer);
  }
  await writeFile(join(output, 'browser.log'), redact(logs));
  assert.equal(
    exitCode,
    0,
    `Browser CORS verification failed; see ${output}/browser.log`,
  );
  const browserReport = JSON.parse(
    await readFile(join(output, 'storage-cors.json'), 'utf8'),
  );
  assert.equal(browserReport.status, 'passed');
  for (const target of targets) {
    const result = browserReport.services.find(
      (item) => item.service === target.service,
    );
    const client = new S3Client({
      ...target,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    try {
      const absent = [];
      for (const probe of result.probes) {
        const key = `ariso/${result.storageId}/${probe.key}`;
        await assert.rejects(
          client.send(
            new HeadObjectCommand({ Bucket: target.bucket, Key: key }),
          ),
          (error) => error.$metadata?.httpStatusCode === 404,
        );
        absent.push(key);
      }
      const prefix = `ariso/${result.storageId}/`;
      const listed = await client.send(
        new ListObjectsV2Command({ Bucket: target.bucket, Prefix: prefix }),
      );
      assert.equal(listed.IsTruncated, false);
      assert.equal(listed.Contents?.length ?? 0, 0);
      report.services.push({
        service: target.service,
        storageId: result.storageId,
        exactKeysAbsent: absent,
        finalList: { prefix, objects: [], truncated: false },
      });
    } finally {
      client.destroy();
    }
  }
  report.status = 'passed';
} catch (error) {
  report.error = redact(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, 'live.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Real CORS browser verification ${report.status}: ${output}/live.json`,
  );
}
