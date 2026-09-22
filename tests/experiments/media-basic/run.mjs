import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  for (const policy of report.environment.policy.split('Policy:')) {
    if (/Resource/.test(policy))
      assert.doesNotMatch(
        policy,
        /name:\s*(width|height|list-length)\b/i,
        'Installed policy must not reintroduce fixed input limits',
      );
  }
  const outputDirectory = join(directory, 'images');
  await mkdir(outputDirectory);
  report.checks.push({
    name: 'image-behavior',
    evidence: await verifyImages({ sourceDirectory, outputDirectory, run }),
  });
  const evidenceDirectory = dirname(resolve(values.report));
  await mkdir(evidenceDirectory, { recursive: true });
  await cp(outputDirectory, join(evidenceDirectory, 'derivatives'), {
    recursive: true,
  });
  await cp(sourceDirectory, join(evidenceDirectory, 'sources'), {
    recursive: true,
  });
  await rm(outputDirectory, { recursive: true });
  const processResult = await verifyProcessLifecycle();
  report.checks.push({ name: 'process-lifecycle', evidence: processResult });
  report.incomplete.push(...processResult.incomplete);
  report.checks.push({
    name: 'stopped-real-tool',
    evidence: await verifyStoppedTool({ sourceDirectory, directory, run }),
  });
  // A skinny real raster crosses historical 16K/32K width restrictions cheaply.
  const wide = join(sourceDirectory, 'wide.png');
  await run('magick', [...limits(0), '-size', '32769x1', 'xc:red', wide]);
  const widePreview = join(directory, 'wide.webp');
  await run('magick', [...limits(0), wide, '-resize', '640x640>', widePreview]);
  assert.equal(
    (await run('magick', ['identify', '-format', '%m %wx%h', widePreview]))
      .stdout,
    'WEBP 640x1',
  );
  await rm(widePreview);
  report.checks.push({
    name: 'wide-raster-without-fixed-admission',
    width: 32769,
    preview: '640x1',
  });
  report.checks.push({
    name: 'resources',
    evidence: await verifyResources({
      sourceDirectory,
      directory,
      run,
      measure,
    }),
  });
  assert.deepEqual(
    report.incomplete,
    [],
    'Missing real environments cannot pass',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = {
    message: error.message,
    stack: error.stack,
    stderr: error.stderr,
    code: error.code,
    measurement: error.measurement,
  };
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
        checks: report.checks.map(({ name }) => name),
      },
      null,
      2,
    ),
  );
}
