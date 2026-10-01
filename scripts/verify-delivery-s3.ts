import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { parse as parseDisposition } from 'content-disposition';
import { analyticsImageTotals } from '../src/server/analytics/schema.ts';
import {
  mediaImages,
  mediaSettings,
  versionKinds,
} from '../src/server/media/schema.ts';
import { storageConfigs } from '../src/server/storage/schema.ts';
import { stageError } from '../src/server/storage/probes.ts';
import { launchS3Delivery } from '../tests/integration/delivery/s3-fixture.ts';
import { startProtocolEndpoint } from '../tests/integration/delivery/s3-endpoint.ts';
import { email, password } from '../tests/integration/identity/auth-fixture.ts';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: z.url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
  serviceVersion: z.string().optional(),
});
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    service: { type: 'string' },
    output: { type: 'string', default: 'test-results/delivery-s3-live' },
    'wait-for-expiry': { type: 'boolean', default: false },
    browser: { type: 'boolean', default: false },
  },
});
const targets = values.config
  ? targetSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
assert.equal(
  new Set(targets.map((target) => target.service)).size,
  targets.length,
);
const selected = values.service
  ? [z.enum(['r2', 'seaweedfs']).parse(values.service)]
  : (['r2', 'seaweedfs'] as const);
const root = resolve(values.output);
await mkdir(root, { recursive: true });
const output = await mkdtemp(join(root, 'run-'));
const signal = new AbortController();
const interrupt = () =>
  signal.abort(new Error('Delivery verification interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const manifest = JSON.parse(
  await readFile('tests/fixtures/media-formats/manifest.json', 'utf8'),
) as {
  samples: {
    id: string;
    file: string;
    sha256: string;
    expected: { format: string; classification: string };
  }[];
};
const mime: Record<string, string> = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  WEBP: 'image/webp',
  AVIF: 'image/avif',
  BMP: 'image/bmp',
  TIFF: 'image/tiff',
  HEIC: 'image/heic',
  GIF: 'image/gif',
  ICO: 'image/x-icon',
  SVG: 'image/svg+xml',
};
async function verify(service: (typeof selected)[number]) {
  const target = targets.find((item) => item.service === service);
  const directory = join(output, service);
  await mkdir(directory);
  const checks: {
    name: string;
    status: 'passed' | 'failed' | 'incomplete';
    evidence: unknown;
  }[] = [];
  const report = {
    status: 'incomplete',
    service,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    target: target && {
      endpoint: target.endpoint,
      bucket: target.bucket,
      serviceVersion: target.serviceVersion,
    },
    checks,
    cleanup: 'No requests started',
  };
  const save = () =>
    writeFile(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  if (!target) {
    checks.push({
      name: 'real-service-environment',
      status: 'incomplete',
      evidence:
        'No test bucket and explicit credentials supplied; no requests started',
    });
    await save();
    console.log(`${service}: incomplete; ${directory}/report.json`);
    return report;
  }
  const secrets = Object.values(target.credentials);
  let app: Awaited<ReturnType<typeof launchS3Delivery>> | undefined;
  const check = async (name: string, action: () => Promise<unknown>) => {
    signal.signal.throwIfAborted();
    try {
      const evidence = await action();
      checks.push({ name, status: 'passed', evidence });
      return evidence;
    } catch (error) {
      checks.push({
        name,
        status: 'failed',
        evidence: stageError(error, secrets),
      });
      throw error;
    } finally {
      await save();
    }
  };
  async function request(
    imageId: string,
    query: string,
    method = 'GET',
    owner = false,
  ) {
    const response = await fetch(`${app!.origin}/i/${imageId}${query}`, {
      method,
      headers: owner ? { cookie: app!.cookie } : {},
      redirect: 'manual',
      signal: AbortSignal.any([signal.signal, AbortSignal.timeout(30000)]),
    });
    assert.equal(
      response.headers.get('cache-control'),
      'private, no-store, no-transform',
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return response;
  }
  async function remote(url: string, method = 'GET') {
    const response = await fetch(url, {
      method,
      headers: { 'accept-encoding': 'identity' },
      signal: AbortSignal.any([signal.signal, AbortSignal.timeout(30000)]),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      response,
      bytes,
      evidence: {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        etag: response.headers.get('etag'),
        contentDisposition: response.headers.get('content-disposition'),
        cacheControl: response.headers.get('cache-control'),
        requestId: response.headers.get('x-amz-request-id'),
        server: response.headers.get('server'),
        cfRay: response.headers.get('cf-ray'),
      },
    };
  }
  try {
    report.cleanup = 'Exact keys retained in keys.json before every write';
    await save();
    app = await launchS3Delivery(
      target,
      join(directory, 'keys.json'),
      signal.signal,
    );
    const asset = await app.seed({ fourVersions: true });
    const privateAsset = await app.seed({
      fourVersions: true,
      visibility: 'private',
    });
    let getUrl = '',
      headUrl = '',
      expiresAt = 0;
    await check(
      'real-GET-HEAD-methods-300s-cache-attachment-and-bytes',
      async () => {
        for (const method of ['GET', 'HEAD']) {
          const response = await request(
            asset.imageId,
            '?type=original&download=1',
            method,
            true,
          );
          assert.equal(response.status, 302);
          assert.equal(await response.text(), '');
          const url = new URL(response.headers.get('location')!);
          assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
          if (method === 'GET') getUrl = url.href;
          else headUrl = url.href;
          const date = url.searchParams.get('X-Amz-Date')!;
          expiresAt = Math.max(
            expiresAt,
            Date.parse(
              date.replace(
                /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                '$1-$2-$3T$4:$5:$6Z',
              ),
            ) + 300000,
          );
          const result = await remote(url.href, method);
          assert.equal(result.response.status, 200);
          if (method === 'GET') {
            assert.deepEqual(result.bytes, asset.bytes);
            assert.equal(
              result.evidence.cacheControl,
              'private, no-store, no-transform',
            );
            assert.match(result.evidence.contentDisposition!, /^attachment;/);
            assert.ok(
              result.evidence.contentDisposition!.includes(
                "filename*=UTF-8''%E6%97%85%E8%A1%8C.final.png",
              ),
            );
          } else {
            assert.equal(result.bytes.length, 0);
            assert.equal(
              result.evidence.contentLength,
              String(asset.bytes.length),
            );
            assert.equal(result.evidence.contentType, 'image/png');
            assert.ok(result.evidence.etag);
          }
        }
        assert.equal((await remote(getUrl, 'HEAD')).response.status, 403);
        assert.equal((await remote(headUrl)).response.status, 403);
        return {
          get: (await remote(getUrl)).evidence,
          head: (await remote(headUrl, 'HEAD')).evidence,
          expiresSeconds: 300,
          methodIsolation: true,
        };
      },
    );
    await check(
      'four-published-version-permissions-and-real-aggregation',
      async () => {
        for (const kind of versionKinds) {
          assert.equal(
            (await request(privateAsset.imageId, `?type=${kind}`)).status,
            401,
          );
          assert.equal(
            (await request(privateAsset.imageId, `?type=${kind}`, 'GET', true))
              .status,
            302,
          );
          const response = await request(asset.imageId, `?type=${kind}`);
          assert.equal(response.status, 302);
          assert.equal(response.headers.get('x-ariso-image-version'), kind);
          assert.deepEqual(
            (await remote(response.headers.get('location')!)).bytes,
            asset.bytes,
          );
          assert.equal(
            (await request(asset.imageId, `?type=${kind}`, 'HEAD')).status,
            302,
          );
        }
        return {
          kinds: versionKinds,
          fixture:
            'Known published four-version delivery fixture; image processing is verified separately',
        };
      },
    );
    await check(
      'new-permissions-revoke-Ariso-access-but-issued-URLs-remain-valid-until-expiry',
      async () => {
        const boundaries = [];
        for (const condition of ['private', 'trashed', 'disabled'] as const) {
          if (condition === 'private')
            app!.db
              .update(mediaImages)
              .set({ visibility: 'private' })
              .where(eq(mediaImages.id, asset.imageId))
              .run();
          if (condition === 'trashed')
            app!.db
              .update(mediaImages)
              .set({ trashedAt: new Date() })
              .where(eq(mediaImages.id, asset.imageId))
              .run();
          if (condition === 'disabled')
            app!.db
              .update(storageConfigs)
              .set({ enabled: false })
              .where(eq(storageConfigs.id, app!.storageId))
              .run();
          const expected =
            condition === 'private' ? 401 : condition === 'trashed' ? 404 : 409;
          for (const method of ['GET', 'HEAD'])
            assert.equal(
              (await request(asset.imageId, '?type=original', method)).status,
              expected,
            );
          if (condition !== 'private')
            for (const method of ['GET', 'HEAD'])
              assert.equal(
                (await request(asset.imageId, '?type=original', method, true))
                  .status,
                expected,
              );
          const get = await remote(getUrl),
            head = await remote(headUrl, 'HEAD');
          assert.equal(get.response.status, 200);
          assert.deepEqual(get.bytes, asset.bytes);
          assert.equal(head.response.status, 200);
          boundaries.push({
            condition,
            newArisoStatus: expected,
            previousGET: get.evidence,
            previousHEAD: head.evidence,
          });
          app!.db
            .update(mediaImages)
            .set({ visibility: 'public', trashedAt: null })
            .where(eq(mediaImages.id, asset.imageId))
            .run();
          app!.db
            .update(storageConfigs)
            .set({ enabled: true })
            .where(eq(storageConfigs.id, app!.storageId))
            .run();
          for (const method of ['GET', 'HEAD'])
            assert.equal(
              (await request(asset.imageId, '?type=original', method, true))
                .status,
              302,
            );
        }
        return {
          boundaries,
          limit:
            'Issued remote access cannot be revoked through Ariso; actual expiry is checked separately',
        };
      },
    );
    await check(
      'published-atomic-reference-switch-changes-current-links-and-preserves-old-signed-bytes',
      async () => {
        app!.db
          .update(mediaSettings)
          .set({ defaultLinkVersion: 'compressed' })
          .run();
        const before = await request(
          asset.imageId,
          '?type=compressed',
          'GET',
          true,
        );
        assert.equal(before.status, 302);
        const oldUrl = before.headers.get('location')!;
        const replacement = await readFile(
          'tests/fixtures/media-formats/source.png',
        );
        assert.notDeepEqual(replacement, asset.bytes);
        const objectId = await app!.publish(
          asset.imageId,
          'compressed',
          replacement,
        );
        const evidence = [];
        for (const query of ['?type=compressed', '']) {
          const current = await request(asset.imageId, query, 'GET', true);
          assert.equal(current.status, 302);
          assert.equal(
            current.headers.get('x-ariso-image-version'),
            'compressed',
          );
          const location = current.headers.get('location')!;
          assert.notEqual(new URL(location).pathname, new URL(oldUrl).pathname);
          const result = await remote(location);
          assert.equal(result.response.status, 200);
          assert.deepEqual(result.bytes, replacement);
          evidence.push({
            query,
            currentObjectId: objectId,
            remote: result.evidence,
          });
        }
        assert.deepEqual((await remote(oldUrl)).bytes, asset.bytes);
        return {
          evidence,
          previousBytesPreserved: true,
          scope:
            'Known published atomic reference switch; this does not claim S3 image processing or remote reprocessing',
        };
      },
    );
    await check(
      'all-real-special-format-original-bytes-and-default-applicability',
      async () => {
        app!.db
          .update(mediaSettings)
          .set({ defaultLinkVersion: 'compressed' })
          .run();
        const samples = [];
        for (const sample of manifest.samples) {
          const bytes = await readFile(
            resolve('tests/fixtures/media-formats', sample.file),
          );
          assert.equal(
            createHash('sha256').update(bytes).digest('hex'),
            sample.sha256,
          );
          const special = await app!.seed({
            bytes,
            format: sample.expected.format,
            mime: mime[sample.expected.format],
            classification:
              sample.expected.classification === 'static'
                ? 'static'
                : sample.expected.classification === 'animation'
                  ? 'animated'
                  : 'preview_only',
          });
          const response = await request(
            special.imageId,
            '?type=original',
            'GET',
            true,
          );
          assert.equal(response.status, 302);
          const received = await remote(response.headers.get('location')!);
          assert.equal(received.response.status, 200);
          assert.deepEqual(received.bytes, bytes);
          assert.equal(
            received.evidence.cacheControl,
            'private, no-store, no-transform',
          );
          assert.equal(
            received.evidence.contentType,
            sample.expected.format === 'SVG'
              ? 'application/octet-stream'
              : mime[sample.expected.format],
          );
          const disposition = parseDisposition(
            received.evidence.contentDisposition!,
          );
          const extension =
            sample.expected.format === 'JPEG'
              ? 'jpg'
              : sample.expected.format.toLowerCase();
          assert.equal(
            disposition.parameters.filename,
            `旅行.final.${extension}`,
          );
          assert.equal(
            disposition.type,
            sample.expected.format === 'SVG' ? 'attachment' : 'inline',
          );
          if (sample.expected.format === 'SVG') {
            assert.equal(
              received.evidence.contentType,
              'application/octet-stream',
            );
            assert.match(received.evidence.contentDisposition!, /^attachment;/);
            assert.ok(received.evidence.contentDisposition!.includes('.svg'));
          }
          const fallback = await request(special.imageId, '', 'GET', true);
          assert.equal(
            fallback.status,
            sample.expected.classification === 'static' ? 404 : 302,
          );
          if (fallback.status === 302)
            assert.equal(
              fallback.headers.get('x-ariso-image-version'),
              'original',
            );
          assert.equal(
            (await request(special.imageId, '?type=compressed', 'GET', true))
              .status,
            404,
          );
          samples.push({
            id: sample.id,
            sha256: sample.sha256,
            bytes: bytes.length,
            remote: received.evidence,
            defaultStatus: fallback.status,
          });
        }
        return samples;
      },
    );
    if (values.browser) {
      await check(
        'real-service-browser-SVG-cookie-and-external-embed',
        async () => {
          assert.ok(
            Number(process.env.EGO_TASK_SPACE),
            'Use the existing EGO_TASK_SPACE',
          );
          const svg = await app!.seed({
            file: 'tests/fixtures/media-formats/static.svg',
            format: 'SVG',
            mime: 'image/svg+xml',
            classification: 'preview_only',
          });
          const embed = await startProtocolEndpoint();
          try {
            const source = await readFile('e2e/delivery-s3.mjs', 'utf8');
            const config = {
              origin: app!.origin,
              embedOrigin: embed.embedOrigin,
              publicImageId: asset.imageId,
              privateImageId: privateAsset.imageId,
              svgImageId: svg.imageId,
              samplePath: asset.file,
              svgPath: svg.file,
              credentials: { email, password },
              spaceId: Number(process.env.EGO_TASK_SPACE),
              output: directory,
            };
            const child = promisify(execFile)('ego-browser', ['nodejs'], {
              timeout: 120000,
              signal: signal.signal,
              maxBuffer: 1024 * 1024,
            });
            child.child.stdin!.end(
              `const config = ${JSON.stringify(config)};\n${source}`,
            );
            await child;
            return JSON.parse(
              await readFile(
                join(directory, 'delivery-s3/browser.json'),
                'utf8',
              ),
            );
          } finally {
            await embed.close();
          }
        },
      );
    }
    await app.shutdown();
    await check('real-memory-collector-graceful-flush', async () => {
      const totals = app!.db
        .select()
        .from(analyticsImageTotals)
        .where(eq(analyticsImageTotals.imageId, asset.imageId))
        .get();
      // Browser adds a public original embed only when explicitly selected.
      assert.deepEqual(
        {
          original: totals?.originalCount,
          compressed: totals?.compressedCount,
          watermark: totals?.watermarkCount,
        },
        { original: values.browser ? 2 : 1, compressed: 1, watermark: 1 },
      );
      assert.equal(
        app!.db
          .select()
          .from(analyticsImageTotals)
          .where(eq(analyticsImageTotals.imageId, privateAsset.imageId))
          .get(),
        undefined,
      );
      return totals;
    });
    if (values['wait-for-expiry']) {
      while (Date.now() < expiresAt + 2000) {
        console.log(
          `${service}: waiting for real 300-second expiry; ${directory}/report.json`,
        );
        await delay(Math.min(30000, expiresAt + 2000 - Date.now()), undefined, {
          signal: signal.signal,
        });
      }
      await check('real-signatures-expire-after-300-seconds', async () => {
        const get = await remote(getUrl),
          head = await remote(headUrl, 'HEAD');
        assert.equal(get.response.status, 403);
        assert.equal(head.response.status, 403);
        return {
          expiresAt: new Date(expiresAt).toISOString(),
          checkedAt: new Date().toISOString(),
          get: get.evidence,
          head: head.evidence,
        };
      });
    } else
      checks.push({
        name: 'real-signature-expiry',
        status: 'incomplete',
        evidence:
          'Run --wait-for-expiry to prove real expiry; encoded duration alone is insufficient',
      });
  } catch (error) {
    if (!checks.some((item) => item.status === 'failed'))
      checks.push({
        name: 'setup-or-interruption',
        status: 'failed',
        evidence: stageError(error, secrets),
      });
  } finally {
    try {
      await app?.close();
      report.cleanup = app
        ? 'All recorded exact keys deleted and HEAD-confirmed absent'
        : 'No fixture returned; inspect keys.json if present';
    } catch (error) {
      report.cleanup = 'Exact cleanup failed; retry only recorded keys.json';
      checks.push({
        name: 'exact-cleanup',
        status: 'failed',
        evidence: stageError(error, secrets),
      });
    }
    report.status = checks.some((item) => item.status === 'failed')
      ? 'failed'
      : checks.some((item) => item.status === 'incomplete')
        ? 'incomplete'
        : 'passed';
    report.finishedAt = new Date().toISOString();
    await save();
    console.log(`${service}: ${report.status}; ${directory}/report.json`);
  }
  return report;
}
try {
  // Keep browser ownership serial when selected; HTTP-only services wait concurrently.
  const reports = values.browser
    ? await (async () => {
        const result = [];
        for (const service of selected) result.push(await verify(service));
        return result;
      })()
    : await Promise.all(selected.map(verify));
  if (reports.some((report) => report.status !== 'passed'))
    process.exitCode = 1;
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
