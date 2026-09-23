import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { session } from '../../../src/server/identity/schema.ts';
import { mediaImages } from '../../../src/server/media/schema.ts';
import { launchLocalDelivery } from '../../integration/delivery/local-fixture.ts';
import { email, password } from '../../integration/identity/auth-fixture.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(spaceId, 'Reuse the goal Ego space with EGO_TASK_SPACE');
const output = resolve('test-results/delivery-production-browser');
await mkdir(output, { recursive: true });
const app = await launchLocalDelivery();
const external = createServer();
async function browser(source: string, config: Record<string, unknown>) {
  const result = promisify(execFile)('ego-browser', ['nodejs'], {
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  result.child.stdin!.end(
    `const config = ${JSON.stringify({ spaceId, output, origin: app.origin, ...config })};\n${source}`,
  );
  const { stdout, stderr } = await result;
  console.log(stdout);
  if (stderr) console.error(stderr);
}
let failure: unknown;
try {
  const png = await app.seed();
  const svg = await app.seed(true);
  external.on('request', (_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(
      `<img src="${app.origin}/i/${png.imageId}?type=original" alt="External public image"><a id="png" href="${app.origin}/i/${png.imageId}?type=original&download=1">Download PNG</a><a id="svg" href="${app.origin}/i/${svg.imageId}?type=original">Download SVG</a>`,
    );
  });
  external.listen(0, '127.0.0.1');
  await once(external, 'listening');
  const address = external.address();
  assert.ok(address && typeof address !== 'string');
  await browser(
    await readFile('tests/verification/delivery/browser.mjs', 'utf8'),
    {
      externalOrigin: `http://127.0.0.1:${address.port}`,
      credentials: { email, password },
    },
  );
  assert.deepEqual(await readFile(`${output}/旅行.final.png`), png.bytes);
  assert.deepEqual(await readFile(`${output}/旅行.svg`), svg.bytes);
  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, png.imageId))
    .run();
  const check = `const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(config.spaceId); const page = task.page('p1');
const result = await page.evaluate(async ({ imageId }) => { const response = await fetch('/i/' + imageId + '?type=original'); return { status: response.status, size: (await response.arrayBuffer()).byteLength }; }, config);
assert.equal(result.status, config.expected); console.log(result);`;
  await browser(check, { imageId: png.imageId, expected: 200 });
  app.db.delete(session).run();
  await browser(check, { imageId: png.imageId, expected: 401 });
  await writeFile(
    `${output}/session.json`,
    JSON.stringify(
      {
        privateWithCookie: 200,
        revokedCookie: 401,
        exactDownloadedBytes: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  failure = error;
  throw error;
} finally {
  const cleanup = await Promise.allSettled([
    writeFile(
      `${output}/server.log`,
      app
        .logs()
        .split('\n')
        .filter((line) => !line.includes('setup-code'))
        .join('\n'),
    ),
    (async () => {
      if (!external.listening) return;
      external.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        external.close((error) => (error ? reject(error) : resolve())),
      );
    })(),
    app.close(),
  ]);
  const errors = cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (errors.length)
    throw new AggregateError(
      failure ? [failure, ...errors] : errors,
      'Delivery browser verification cleanup failed',
    );
}
// The coordinator closes the shared TaskSpace after all browser verification.
