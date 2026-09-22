import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { verifyImages } from './images.mjs';
import { verifyProcessLifecycle } from './process.mjs';
import {
  baseline,
  createMeasurement,
  limits,
  verifyResources,
  verifyStoppedTool,
} from './resources.mjs';

const { values } = parseArgs({
  options: {
    'source-root': { type: 'string' },
    'low-space-root': { type: 'string' },
    report: { type: 'string' },
  },
});
assert.ok(
  values['source-root'] && values['low-space-root'] && values.report,
  'Supply dedicated source/low-space roots and report',
);
const report = {
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    release: release(),
    uid: process.getuid?.(),
  },
  baseline,
  commands: [],
  checks: [],
  incomplete: [],
};
const owned = [];
function failure(error) {
  return {
    message: error.message,
    stack: error.stack,
    stderr: error.stderr,
    code: error.code,
    measurement: error.measurement,
  };
}
// Independent scenarios continue collecting evidence; any failed assertion
// still makes the complete run fail. Environment failures stop the run.
async function check(name, action) {
  try {
    report.checks.push({ name, status: 'passed', evidence: await action() });
  } catch (error) {
    report.checks.push({ name, status: 'failed', failure: failure(error) });
  }
}
try {
  assert.equal(process.versions.node.split('.')[0], '24');
  assert.equal(
    platform(),
    'linux',
    'Full experiment requires real Linux container mounts',
  );
  assert.notEqual(process.getuid(), 0, 'Use the image default non-root user');
  const sourceDirectory = await mkdtemp(
    join(values['source-root'], 'media-source-'),
  );
  owned.push(sourceDirectory);
  const directory = await mkdtemp(
    join(values['low-space-root'], 'media-work-'),
  );
  owned.push(directory);
  const { run, measure } = createMeasurement(directory, report.commands);
  report.environment.magick = (await run('magick', ['-version'])).stdout;
  report.environment.exiftool = (await run('exiftool', ['-ver'])).stdout;
  report.environment.policy = (await run('magick', ['-list', 'policy'])).stdout;
  report.environment.resources = (
    await run('magick', ['-list', 'resource'])
  ).stdout;
  assert.match(report.environment.magick, /ImageMagick 7\./);
  // Do not override installed policy: detect any inherited fixed admission cap.
  await check('installed-policy', async () => {
    for (const policy of report.environment.policy.split('Policy:')) {
      if (/Resource/.test(policy))
        assert.doesNotMatch(
          policy,
          /name:\s*(width|height|list-length)\b/i,
          'Installed policy must not reintroduce fixed input limits',
        );
    }
  });
  const outputDirectory = join(directory, 'images');
  await mkdir(outputDirectory);
  await check('image-behavior', () =>
    verifyImages({ sourceDirectory, outputDirectory, run }),
  );
  const evidenceDirectory = dirname(resolve(values.report));
  await mkdir(evidenceDirectory, { recursive: true });
  await cp(outputDirectory, join(evidenceDirectory, 'derivatives'), {
    recursive: true,
  });
  await cp(sourceDirectory, join(evidenceDirectory, 'sources'), {
    recursive: true,
  });
  // mkdtemp uses 0700; exported public fixtures must be readable by the host runner.
  await chmod(join(evidenceDirectory, 'sources'), 0o755);
  await rm(outputDirectory, { recursive: true });
  await check('process-lifecycle', async () => {
    const result = await verifyProcessLifecycle();
    report.incomplete.push(...result.incomplete);
    assert.deepEqual(result.incomplete, []);
    return result;
  });
  await check('stopped-real-tool', () =>
    verifyStoppedTool({ sourceDirectory, directory, run }),
  );
  // A skinny real raster crosses historical 16K/32K width restrictions cheaply.
  const wideDirectory = join(directory, 'wide');
  await mkdir(wideDirectory);
  await check('wide-raster-without-fixed-admission', async () => {
    const wide = join(wideDirectory, 'wide.png');
    await run('magick', [...limits(0), '-size', '32769x1', 'xc:red', wide]);
    const widePreview = join(wideDirectory, 'wide.webp');
    await run('magick', [
      ...limits(0),
      wide,
      '-resize',
      '640x640>',
      widePreview,
    ]);
    assert.equal(
      (await run('magick', ['identify', '-format', '%m %wx%h', widePreview]))
        .stdout,
      'WEBP 640x1',
    );
    return { width: 32769, preview: '640x1' };
  });
  await rm(wideDirectory, { recursive: true });
  await check('resources', () =>
    verifyResources({ sourceDirectory, directory, run, measure }),
  );
  assert.deepEqual(
    report.incomplete,
    [],
    'Missing real environments cannot pass',
  );
  report.status = report.checks.some((check) => check.status === 'failed')
    ? 'failed'
    : 'passed';
  if (report.status === 'failed') process.exitCode = 1;
} catch (error) {
  report.status = 'failed';
  report.failure = failure(error);
  process.exitCode = 1;
} finally {
  for (const directory of owned.reverse())
    await rm(directory, { recursive: true, force: true });
  await mkdir(dirname(resolve(values.report)), { recursive: true });
  await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        status: report.status,
        report: values.report,
        failure: report.failure,
        checks: report.checks.map(({ name, status, failure }) => ({
          name,
          status,
          failure,
        })),
      },
      null,
      2,
    ),
  );
}
