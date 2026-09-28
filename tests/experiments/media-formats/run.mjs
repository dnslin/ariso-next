import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execa } from 'execa';
import { assertCoverage, assertPixels, recordCheck } from './checks.mjs';
import { verifyMetadata } from './metadata.mjs';
import { verifySvg } from './svg.mjs';

const fixtures = fileURLToPath(
  new URL('../../fixtures/media-formats/', import.meta.url),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function runMatrix(outputDirectory) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-media-formats-'));
  const report = {
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      release: release(),
    },
    scope:
      'Native-tool experiment. Production all-format processing remains T-MED-06 (#150).',
    commands: [],
    checks: [],
  };
  async function run(command, args, options = {}) {
    const started = performance.now();
    try {
      const result = await execa(command, args, {
        timeout: 120_000,
        forceKillAfterDelay: 1000,
        maxBuffer: 32 * 1024 * 1024,
        ...options,
      });
      report.commands.push({
        command,
        args,
        exitCode: result.exitCode,
        durationMs: Math.round(performance.now() - started),
        stderr: result.stderr,
      });
      return result;
    } catch (error) {
      report.commands.push({
        command,
        args,
        exitCode: error.exitCode,
        durationMs: Math.round(performance.now() - started),
        stderr: error.stderr,
        error: error.shortMessage ?? error.message,
      });
      throw error;
    }
  }
  const check = (name, action) => recordCheck(report.checks, name, action);
  try {
    assert.equal(process.versions.node.split('.')[0], '24');
    report.environment.magick = (await run('magick', ['-version'])).stdout;
    report.environment.ffmpeg = (await run('ffmpeg', ['-version'])).stdout;
    report.environment.exiftool = (await run('exiftool', ['-ver'])).stdout;
    report.environment.policy = (
      await run('magick', ['-list', 'policy'])
    ).stdout;
    assert.match(report.environment.magick, /ImageMagick 7\./);
    const { samples } = JSON.parse(
      await readFile(join(fixtures, 'manifest.json'), 'utf8'),
    );
    await check('complete-sample-coverage', async () => {
      assertCoverage(samples);
      return { count: samples.length };
    });
    await check('no-fixed-admission-policy', async () => {
      for (const entry of report.environment.policy.split('Policy:'))
        if (/Resource/.test(entry))
          assert.doesNotMatch(entry, /name:\s*(width|height|list-length)\b/i);
      return { unchangedInstalledPolicy: true };
    });
    for (const sample of samples) {
      await check(sample.id, async () => {
        const source = join(fixtures, sample.file);
        const before = await readFile(source);
        assert.equal(hash(before), sample.sha256, 'Original fixture digest');
        assert.ok(
          sample.source && sample.license,
          'Fixture source and license',
        );
        const { stdout } = await run('exiftool', [
          '-json',
          '-a',
          '-G1:3:4',
          '-n',
          source,
        ]);
        const [metadata] = JSON.parse(stdout);
        for (const [key, expected] of Object.entries(
          sample.expected.nativeTags,
        ))
          assert.deepEqual(metadata[key], expected, `${sample.id}: ${key}`);
        let decodedImages;
        if (sample.expected.decodedImages !== undefined) {
          const { stdout: count } = await run('magick', [
            'identify',
            '-ping',
            '-format',
            '%n\n',
            source,
          ]);
          decodedImages = Number(count.split('\n')[0]);
          assert.equal(
            decodedImages,
            sample.expected.decodedImages,
            'Independent decoded images (auxiliary excluded)',
          );
        }
        let tracks;
        const preview = sample.preview;
        const output = join(directory, `${sample.id}.webp`);
        let input = preview.input.replace(sample.file, source);
        if (
          ['PNG', 'AVIF'].includes(sample.expected.format) &&
          sample.expected.classification === 'animation'
        ) {
          // Directly bound decoding to one display frame. ImageMagick's APNG
          // delegate otherwise materializes a sequence before selecting [0].
          const frame = await run(
            'ffmpeg',
            [
              '-v',
              'error',
              ...(sample.expected.format === 'PNG' ? ['-f', 'apng'] : []),
              '-i',
              source,
              '-map',
              '0:v:0',
              '-frames:v',
              '1',
              '-f',
              'image2pipe',
              '-vcodec',
              'png',
              'pipe:1',
            ],
            { encoding: 'buffer' },
          );
          input = join(directory, `${sample.id}-first.png`);
          await writeFile(input, frame.stdout);
        }
        if (
          sample.expected.format === 'AVIF' &&
          sample.expected.classification === 'animation'
        ) {
          const { stdout: probe } = await run('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,nb_frames,width,height',
            '-of',
            'json',
            source,
          ]);
          tracks = JSON.parse(probe).streams;
          assert.ok(
            tracks.some(
              (track) =>
                track.codec_name === 'av1' &&
                Number(track.nb_frames) === sample.expected.frames,
            ),
            'AVIF timed image track frame count',
          );
        }
        try {
          await run('magick', [
            input,
            ...(sample.expected.classification === 'animation'
              ? ['-coalesce']
              : []),
            '-auto-orient',
            '-colorspace',
            'sRGB',
            '-resize',
            '640x640>',
            '-strip',
            '-quality',
            '80',
            output,
          ]);
          const dimensions = (
            await run('magick', ['identify', '-format', '%m %wx%h', output])
          ).stdout;
          assert.equal(dimensions, `WEBP ${preview.width}x${preview.height}`);
          const decoded = await run(
            'magick',
            [output, '-depth', '8', 'rgba:-'],
            { encoding: 'buffer' },
          );
          const pixels = assertPixels(
            decoded.stdout,
            preview.width,
            preview.height,
            preview.pixels,
          );
          return {
            source: sample.file,
            sha256: sample.sha256,
            expected: sample.expected,
            metadata,
            decodedImages,
            tracks,
            preview: { dimensions, pixels },
            originalUnchanged: true,
          };
        } finally {
          assert.equal(
            hash(await readFile(source)),
            hash(before),
            'Original bytes after processing',
          );
        }
      });
    }
    await check('misleading-extension-and-truncation', async () => {
      const bytes = await readFile(join(fixtures, 'source.png'));
      const misleading = join(directory, 'misleading.jpg');
      await writeFile(misleading, bytes);
      const { stdout } = await run('exiftool', [
        '-json',
        '-FileType',
        '-MIMEType',
        misleading,
      ]);
      assert.equal(JSON.parse(stdout)[0].FileType, 'PNG');
      assert.equal(JSON.parse(stdout)[0].MIMEType, 'image/png');
      const truncated = join(directory, 'truncated.png');
      await writeFile(truncated, bytes.subarray(0, 40));
      const failed = await run('magick', [`${truncated}[0]`, 'null:'], {
        reject: false,
      });
      assert.notEqual(failed.exitCode, 0, 'Truncated image must not decode');
      assert.equal(hash(await readFile(misleading)), hash(bytes));
      return {
        detectedFormat: 'PNG',
        detectedMime: 'image/png',
        truncatedExitCode: failed.exitCode,
        stderr: failed.stderr,
      };
    });
    await check('metadata-preservation', () =>
      verifyMetadata({ directory, run }),
    );
    await check('svg-external-resources', () => verifySvg({ directory, run }));
  } catch (error) {
    report.checks.push({
      name: 'environment',
      status: 'failed',
      error: error.message,
    });
  } finally {
    try {
      await mkdir(outputDirectory, { recursive: true });
      await cp(directory, join(outputDirectory, 'outputs'), {
        recursive: true,
      });
    } catch (error) {
      report.checks.push({
        name: 'export-evidence',
        status: 'failed',
        error: error.message,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    const artifactKeys = new Set([
      'source',
      'metadataPath',
      'output',
      'profile',
      'path',
    ]);
    function relocate(value) {
      if (Array.isArray(value)) return value.map(relocate);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            artifactKeys.has(key) &&
            typeof item === 'string' &&
            item.startsWith(`${directory}/`)
              ? `outputs/${item.slice(directory.length + 1)}`
              : relocate(item),
          ]),
        );
      return value;
    }
    for (const check of report.checks)
      if (check.evidence) check.evidence = relocate(check.evidence);
    report.status = report.checks.some((item) => item.status === 'failed')
      ? 'failed'
      : 'passed';
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      join(outputDirectory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
  return report;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { 'output-dir': { type: 'string' } },
  });
  const output = resolve(values['output-dir'] ?? 'test-results/media-formats');
  const report = await runMatrix(output);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        report: join(output, 'report.json'),
        checks: report.checks.map(({ name, status, error }) => ({
          name,
          status,
          error,
        })),
      },
      null,
      2,
    ),
  );
  if (report.status !== 'passed') process.exitCode = 1;
}
