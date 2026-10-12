import assert from 'node:assert/strict';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execa } from 'execa';
import { containerEnvironment } from './verify-container.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = `
. /etc/os-release
test "$VERSION_CODENAME" = trixie
node --version
node -e 'require("node:assert/strict").equal(process.versions.node.split(".")[0], "24")'
for package in ca-certificates procps imagemagick-7.q16 ffmpeg libmagickcore-7.q16-10-extra libheif-plugin-aomenc libimage-exiftool-perl fonts-noto-cjk fonts-noto-core; do
  dpkg-query --show "$package"
done
magick -version
exiftool -ver
test -s /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
test -s /usr/share/fonts/truetype/noto/NotoSans-Regular.ttf
for path in server.js entrypoint.sh dist/cli/prestart.js dist/cli/reset-password.js dist/cli/logging.js drizzle/meta/_journal.json public/runtime.svg verification/fixtures/sample.jpg verification/fixtures/sample.png scripts/verify-image.mjs; do
  test -s "$path"
done
node -e 'const assert = require("node:assert/strict"); const Database = require("better-sqlite3"); const db = new Database(":memory:"); assert.equal(db.prepare("SELECT 1 AS ok").get().ok, 1); db.close(); console.log("SQLite native query passed");'
test "$(magick identify -format "%m %wx%h" verification/fixtures/sample.jpg)" = "JPEG 64x48"
test "$(magick identify -format "%m %wx%h" verification/fixtures/sample.png)" = "PNG 64x48"
for path in src tests .env.local .data node_modules/typescript node_modules/drizzle-kit node_modules/vitest; do
  test ! -e "$path"
done
`;

export async function verifyReleaseImage({ image, platform, outputDir }) {
  assert.ok(image, '--image is required');
  assert.match(
    platform ?? '',
    /^linux\/(amd64|arm64)$/,
    '--platform must be linux/amd64 or linux/arm64',
  );
  assert.ok(outputDir, '--output-dir is required');
  const output = resolve(outputDir);
  const imageOutput = join(output, 'image');
  await mkdir(imageOutput, { recursive: true });
  // The final image runs as node; the exported evidence mount belongs to the host.
  await chmod(imageOutput, 0o777);
  const report = { image, platform, checks: [], status: 'running' };
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const options = {
    cwd: root,
    env: containerEnvironment(process.env),
    extendEnv: false,
    cancelSignal: abort.signal,
    // verify-container handles SIGTERM and removes its Compose project before exit.
    forceKillAfterDelay: 60000,
  };
  try {
    const result = await execa(
      'docker',
      [
        'run',
        '--rm',
        '--platform',
        platform,
        '--network',
        'none',
        '--read-only',
        '--entrypoint',
        'sh',
        image,
        '-eu',
        '-c',
        baseline,
      ],
      { ...options, timeout: 120000 },
    );
    await writeFile(
      join(output, 'baseline.log'),
      `${result.stdout}\n${result.stderr}\n`,
    );
    console.log(result.stdout);
    report.checks.push('offline runtime baseline and packaged files');
    await execa(
      'docker',
      [
        'run',
        '--rm',
        '--platform',
        platform,
        '--network',
        'none',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--workdir',
        '/app',
        '--entrypoint',
        'sh',
        '--mount',
        `type=bind,src=${imageOutput},dst=/verification-output`,
        image,
        '-eu',
        '-c',
        `node /app/scripts/verify-image.mjs --output-dir /verification-output
        test -z "$(find /tmp -maxdepth 1 -name 'ariso-verify-image-*')"`,
      ],
      { ...options, timeout: 300000, stdio: 'inherit' },
    );
    report.checks.push(
      'packaged media conversions, formats, metadata and fonts',
    );
    await execa(
      process.execPath,
      [
        join(root, 'scripts/verify-container.mjs'),
        '--image',
        image,
        '--platform',
        platform,
        '--output-dir',
        join(output, 'container'),
      ],
      { ...options, stdio: 'inherit' },
    );
    report.checks.push(
      'production HTTP upload, persistence, lifecycle and recovery',
    );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    if (report.checks.length === 0)
      await writeFile(
        join(output, 'baseline.log'),
        [error.stdout, error.stderr, error.message].filter(Boolean).join('\n') +
          '\n',
      );
    throw error;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await writeFile(
      join(output, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      image: { type: 'string' },
      platform: { type: 'string' },
      'output-dir': { type: 'string' },
    },
  });
  await verifyReleaseImage({
    image: values.image,
    platform: values.platform,
    outputDir: values['output-dir'],
  });
}
