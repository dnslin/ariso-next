import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { services } from './config.ts';

// This runner deliberately calls the production implementation, never protocol.ts.
const targetSchema = z.object({
  service: z.enum(services),
  endpoint: z.url().refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().optional(),
  }),
  serviceVersion: z.string().optional(),
});
type Target = z.infer<typeof targetSchema>;
type Check = {
  name: string;
  status: 'passed' | 'failed' | 'incomplete';
  evidence: unknown;
};
type Report = {
  service: string;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'passed' | 'failed' | 'incomplete';
  environment: { node: string; platform: string; arch: string };
  target?: Omit<Target, 'credentials' | 'service'>;
  storageId?: string;
  keys: { relative: string; remote: string }[];
  putValidUntil?: string;
  cleanupResponsibility: string;
  checks: Check[];
};

function errorEvidence(error: unknown, config?: Target) {
  const value = error as Error & {
    code?: string;
    serviceCode?: string;
    httpStatusCode?: number;
    requestId?: string;
    key?: string;
    operation?: string;
  };
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(
    /https?:\/\/[^\s<>"']*X-Amz-[^\s<>"']*/gi,
    '[signed URL redacted]',
  );
  for (const secret of Object.values(config?.credentials ?? {})) {
    if (secret)
      message = message
        .replaceAll(secret, '[redacted]')
        .replaceAll(encodeURIComponent(secret), '[redacted]');
  }
  return {
    name: value?.name,
    message,
    code: value?.code,
    serviceCode: value?.serviceCode,
    httpStatusCode: value?.httpStatusCode,
    requestId: value?.requestId,
    key: value?.key,
    operation: value?.operation,
  };
}

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/storage-objects' },
    service: { type: 'string' },
    'wait-for-expiry': { type: 'boolean', default: false },
  },
});
const targets = values.config
  ? targetSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
assert.equal(new Set(targets.map((item) => item.service)).size, targets.length);
const selected = values.service
  ? [z.enum(services).parse(values.service)]
  : services;
const root = resolve(values.output);
await mkdir(root, { recursive: true });
const output = await mkdtemp(`${root}/run-`);
const interrupted = new AbortController();
const interrupt = () => interrupted.abort(new Error('Runner interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

async function verify(service: (typeof services)[number]) {
  const config = targets.find((item) => item.service === service);
  const runId = randomUUID();
  const directory = `${output}/${service}`;
  await mkdir(directory);
  const report: Report = {
    service,
    runId,
    startedAt: new Date().toISOString(),
    status: 'incomplete',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    keys: [],
    cleanupResponsibility: 'No remote requests started',
    checks: [],
  };
  const save = async () => {
    await writeFile(
      `${directory}/report.json.tmp`,
      JSON.stringify(report, null, 2) + '\n',
    );
    await rename(`${directory}/report.json.tmp`, `${directory}/report.json`);
  };
  const check = async (name: string, action: () => Promise<unknown>) => {
    try {
      const evidence = await action();
      report.checks.push({ name, status: 'passed', evidence });
      return evidence;
    } catch (error) {
      report.checks.push({
        name,
        status: 'failed',
        evidence: errorEvidence(error, config),
      });
      throw error;
    } finally {
      await save();
    }
  };
  if (!config) {
    report.checks.push({
      name: 'real-service-environment',
      status: 'incomplete',
      evidence:
        'No explicit credentials and test bucket supplied; no remote requests attempted',
    });
    await save();
    return report;
  }
  const { endpoint, region, bucket, forcePathStyle, serviceVersion } = config;
  report.target = { endpoint, region, bucket, forcePathStyle, serviceVersion };
  report.storageId = `verify-155-${runId}`;
  const source = `uploads/${runId}/临时 +%?.svg`;
  const destination = `images/${runId}/original/固定 +%?.svg`;
  const rejectedDestination = `images/${runId}/original/rejected.svg`;
  const missing = `probes/missing-${runId}`;
  const keys = [source, destination, rejectedDestination, missing];
  report.keys = keys.map((relative) => ({
    relative,
    remote: `ariso/${report.storageId}/${relative}`,
  }));
  report.cleanupResponsibility =
    'Exact keys recorded before requests; retry these keys if interrupted';
  // No signing or remote write occurs until the complete cleanup key list is durable.
  await save();
  const storage = createS3Storage({
    ...config,
    id: report.storageId,
    enabled: true,
    pathPrefix: '',
  });
  const options = { signal: interrupted.signal };
  const original = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg"><!--${'完整字节 +%?'.repeat(65536)}--><rect width="1" height="1"/></svg>`,
  );
  const replacement = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>',
  );
  const contentType = 'image/svg+xml';
  const overrides = {
    method: 'GET' as const,
    contentType: 'application/octet-stream',
    contentDisposition:
      'attachment; filename="image.svg"; filename*=UTF-8\'\'%E6%97%85%E8%A1%8C.svg',
    cacheControl: 'private, no-store, no-transform',
  };
  const read = async (key: string, ifMatch?: string) => {
    const result = await storage.readObject(key, { ...options, ifMatch });
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
      return { bytes: Buffer.concat(chunks), metadata: result.metadata };
    } finally {
      result.stream.destroy();
      await finished(result.stream, { cleanup: true }).catch(() => undefined);
    }
  };
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      // Object metadata must not be changed by transport compression.
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        'accept-encoding': 'identity',
      },
      redirect: 'manual',
      signal: AbortSignal.any([
        interrupted.signal,
        AbortSignal.timeout(120_000),
      ]),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      bytes,
      evidence: {
        status: response.status,
        requestId: response.headers.get('x-amz-request-id'),
        server: response.headers.get('server'),
        cfRay: response.headers.get('cf-ray'),
        contentEncoding: response.headers.get('content-encoding'),
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        etag: response.headers.get('etag'),
        contentDisposition: response.headers.get('content-disposition'),
        cacheControl: response.headers.get('cache-control'),
        serviceCode: response.ok
          ? undefined
          : bytes.toString().match(/<Code>([^<]+)<\/Code>/)?.[1],
      },
    };
  };
  const denied = async (url: string, init: RequestInit) => {
    const result = await request(url, init);
    assert.equal(result.evidence.status, 403, JSON.stringify(result.evidence));
    return result.evidence;
  };
  const waitUntil = async (deadline: Date) => {
    while (Date.now() < deadline.getTime() + 2_000) {
      console.log(
        `${service}: waiting for real signature expiry; ${directory}/report.json`,
      );
      await delay(
        Math.min(30_000, deadline.getTime() + 2_000 - Date.now()),
        undefined,
        options,
      );
    }
  };
  try {
    let etag = '';
    await check('stream-put-head-full-get-and-conditional-copy', async () => {
      const put = await storage.writeObject(source, Readable.from([original]), {
        ...options,
        size: original.length,
        contentType,
      });
      const head = await storage.inspectObject(source, options);
      assert.ok(head?.etag);
      assert.equal(head.size, original.length);
      assert.equal(head.contentType, contentType);
      etag = head.etag;
      const received = await read(source, etag);
      assert.deepEqual(received.bytes, original);
      const copy = await storage.copyObject(source, destination, etag, options);
      assert.ok(copy.etag);
      const fixed = await read(destination);
      assert.deepEqual(fixed.bytes, original);
      return {
        put,
        head,
        get: received.metadata,
        copy,
        fixedGet: fixed.metadata,
        bytesCompared: original.length,
      };
    });
    const upload = await storage.signUpload(source, contentType);
    report.putValidUntil = upload.expiresAt.toISOString();
    report.cleanupResponsibility =
      'PUT signature still writable; preserve this exact-key record until expiry and final cleanup';
    await save();
    await check(
      'put-900-seconds-required-headers-and-reput-cannot-change-fixed-object',
      async () => {
        const url = new URL(upload.url);
        assert.equal(url.searchParams.get('X-Amz-Expires'), '900');
        assert.ok(
          url.searchParams
            .get('X-Amz-SignedHeaders')
            ?.split(';')
            .includes('content-type'),
        );
        assert.deepEqual(upload.headers, { 'content-type': contentType });
        const wrongHeader = await denied(upload.url, {
          method: 'PUT',
          headers: { 'content-type': 'text/plain' },
          body: replacement,
        });
        const put = await request(upload.url, {
          method: 'PUT',
          headers: upload.headers,
          body: replacement,
        });
        assert.equal(put.evidence.status, 200, JSON.stringify(put.evidence));
        assert.deepEqual((await read(source)).bytes, replacement);
        assert.deepEqual((await read(destination)).bytes, original);
        return {
          expiresSeconds: 900,
          headers: upload.headers,
          wrongHeader,
          put: put.evidence,
          fixedBytesUnchanged: true,
        };
      },
    );
    await check('changed-source-rejects-stale-etag-get-and-copy', async () => {
      const evidence: unknown[] = [];
      for (const action of [
        () => read(source, etag),
        () => storage.copyObject(source, rejectedDestination, etag, options),
      ]) {
        await assert.rejects(action, (error) => {
          const item = errorEvidence(error, config);
          evidence.push(item);
          return (
            item.code === 'STORAGE_OBJECT_CHANGED' &&
            item.httpStatusCode === 412
          );
        });
      }
      assert.equal(
        await storage.inspectObject(rejectedDestination, options),
        null,
      );
      assert.deepEqual((await read(destination)).bytes, original);
      return evidence;
    });
    const get = await storage.signRead(destination, overrides);
    const head = await storage.signRead(destination, { method: 'HEAD' });
    await check(
      'get-head-300-seconds-response-overrides-and-method-isolation',
      async () => {
        for (const signed of [get, head])
          assert.equal(
            new URL(signed.url).searchParams.get('X-Amz-Expires'),
            '300',
          );
        const got = await request(get.url);
        assert.equal(got.evidence.status, 200);
        assert.equal(got.evidence.contentType, overrides.contentType);
        assert.equal(
          got.evidence.contentDisposition,
          overrides.contentDisposition,
        );
        assert.equal(got.evidence.cacheControl, overrides.cacheControl);
        assert.deepEqual(got.bytes, original);
        const inspected = await request(head.url, { method: 'HEAD' });
        assert.equal(inspected.evidence.status, 200);
        assert.equal(inspected.evidence.contentType, contentType);
        assert.equal(inspected.bytes.length, 0);
        const objectMetadata = await storage.inspectObject(
          destination,
          options,
        );
        assert.ok(objectMetadata);
        assert.equal(
          inspected.evidence.contentLength,
          String(objectMetadata.size),
          JSON.stringify(inspected.evidence),
        );
        assert.equal(
          inspected.evidence.etag,
          objectMetadata.etag,
          JSON.stringify(inspected.evidence),
        );
        return {
          expiresSeconds: 300,
          get: got.evidence,
          head: inspected.evidence,
          headWithGetUrl: await denied(get.url, { method: 'HEAD' }),
          getWithHeadUrl: await denied(head.url, { method: 'GET' }),
        };
      },
    );
    await check(
      'cancel-get-release-stream-and-next-request-succeeds',
      async () => {
        const controller = new AbortController();
        const result = await storage.readObject(destination, {
          signal: AbortSignal.any([interrupted.signal, controller.signal]),
        });
        const closed = finished(result.stream, { cleanup: true });
        controller.abort(new Error('Intentional GET cancellation'));
        await assert.rejects(closed);
        assert.ok(result.stream.destroyed);
        const after = await read(destination);
        assert.deepEqual(after.bytes, original);
        return {
          cancelledGet: result.metadata,
          streamDestroyed: result.stream.destroyed,
          subsequentGet: after.metadata,
        };
      },
    );
    await check(
      'missing-read-is-error-missing-head-is-null-and-delete-is-idempotent',
      async () => {
        let failure;
        await assert.rejects(
          () => read(missing),
          (error) => {
            failure = errorEvidence(error, config);
            return (
              failure.code === 'STORAGE_OBJECT_MISSING' &&
              failure.httpStatusCode === 404
            );
          },
        );
        assert.equal(await storage.inspectObject(missing, options), null);
        const first = await storage.deleteObject(missing, options);
        const second = await storage.deleteObject(missing, options);
        return { failure, first, second };
      },
    );
    if (values['wait-for-expiry']) {
      await waitUntil(
        new Date(Math.max(get.expiresAt.getTime(), head.expiresAt.getTime())),
      );
      await check('real-300-second-get-head-expiry', async () => ({
        checkedAt: new Date().toISOString(),
        getExpiresAt: get.expiresAt,
        headExpiresAt: head.expiresAt,
        get: await denied(get.url, { method: 'GET' }),
        head: await denied(head.url, { method: 'HEAD' }),
      }));
      await waitUntil(upload.expiresAt);
      await check('real-900-second-put-expiry', async () => ({
        checkedAt: new Date().toISOString(),
        expiresAt: upload.expiresAt,
        put: await denied(upload.url, {
          method: 'PUT',
          headers: upload.headers,
          body: replacement,
        }),
      }));
    } else {
      report.checks.push({
        name: 'real-signature-expiry',
        status: 'incomplete',
        evidence:
          'Not waited; rerun with --wait-for-expiry. Encoded durations alone do not verify server expiry.',
      });
    }
  } catch (error) {
    // The failed check contains sanitized error evidence. Cleanup still owns every planned key.
    if (!report.checks.some((item) => item.status === 'failed'))
      report.checks.push({
        name: 'interrupted-or-signing',
        status: 'failed',
        evidence: errorEvidence(error, config),
      });
  } finally {
    const cleanup: unknown[] = [];
    for (const key of keys) {
      try {
        const cleanupOptions = { signal: AbortSignal.timeout(30_000) };
        const deleted = await storage.deleteObject(key, cleanupOptions);
        assert.equal(await storage.inspectObject(key, cleanupOptions), null);
        cleanup.push({ key, status: 'passed', deleted, absent: true });
      } catch (error) {
        cleanup.push({
          key,
          status: 'failed',
          error: errorEvidence(error, config),
        });
        report.checks.push({
          name: `cleanup:${key}`,
          status: 'failed',
          evidence: errorEvidence(error, config),
        });
      }
    }
    storage.destroy();
    report.checks.push({
      name: 'exact-key-final-cleanup',
      status: cleanup.some(
        (item) => (item as { status: string }).status === 'failed',
      )
        ? 'failed'
        : 'passed',
      evidence: cleanup,
    });
    const windowEnded =
      !report.putValidUntil ||
      Date.now() > new Date(report.putValidUntil).getTime();
    report.cleanupResponsibility = windowEnded
      ? 'Local controlled requests ended; inspect cleanup results. An interrupted write does not prove remote settlement. This does not verify the general UPLOAD-V01 late-PUT lifecycle.'
      : 'PUT signature can still write until putValidUntil; exact-key record retained. Immediate DELETE does not revoke it. Final cleanup after expiry remains required.';
    if (!windowEnded)
      report.checks.push({
        name: 'put-window-final-cleanup',
        status: 'incomplete',
        evidence: report.cleanupResponsibility,
      });
    report.status = report.checks.some((item) => item.status === 'failed')
      ? 'failed'
      : report.checks.some((item) => item.status === 'incomplete')
        ? 'incomplete'
        : 'passed';
    report.finishedAt = new Date().toISOString();
    await save();
  }
  return report;
}

try {
  for (const service of selected) {
    const report = await verify(service);
    console.log(
      `${service}: ${report.status}; ${output}/${service}/report.json`,
    );
    if (report.status !== 'passed') process.exitCode = 1;
  }
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
