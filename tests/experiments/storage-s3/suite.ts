import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageConfig, Service } from './config.ts';
import {
  checkAnonymous,
  checkCapabilities,
  checkResponseHeaders,
  createClient,
  errorEvidence,
  signProbe,
  signReads,
  signatureEvidence,
  svg,
  unsignedObjectUrl,
} from './protocol.ts';

export type BrowserProbe = (
  signed: Awaited<ReturnType<typeof signProbe>>,
) => Promise<unknown>;
type Check = {
  name: string;
  status: 'passed' | 'failed' | 'incomplete';
  evidence: unknown;
};
export type Report = {
  service: Service;
  status: 'incomplete' | 'failed' | 'passed';
  startedAt: string;
  environment: { node: string; platform: string; arch: string; sdk: string };
  target?: {
    endpoint: string;
    bucket: string;
    region: string;
    forcePathStyle: boolean;
    serviceVersion: string;
    revision: string;
  };
  ownerConfirmation?: StorageConfig['ownerConfirmation'];
  keys: string[];
  putValidUntil?: string;
  checks: Check[];
};
export function newReport(service: Service): Report {
  return {
    service,
    status: 'incomplete',
    startedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      sdk: '3.1136.0',
    },
    keys: [],
    checks: [],
  };
}

export async function runService(
  config: StorageConfig,
  report: Report,
  save: () => Promise<void>,
  browser?: BrowserProbe,
) {
  const client = createClient(config);
  const { endpoint, bucket, region, forcePathStyle, serviceVersion, revision } =
    config;
  report.target = {
    endpoint,
    bucket,
    region,
    forcePathStyle,
    serviceVersion,
    revision,
  };
  report.ownerConfirmation = config.ownerConfirmation;
  const prefix = `ariso/ev-storage-01/${randomUUID()}`;
  const source = `${prefix}/临时 +%?.svg`;
  const destination = `${prefix}/fixed.svg`;
  const browserKey = `${prefix}/browser.svg`;
  const options = (Key: string) => ({ Bucket: bucket, Key });
  const check = async (name: string, action: () => Promise<unknown>) => {
    try {
      report.checks.push({ name, status: 'passed', evidence: await action() });
    } catch (error) {
      report.checks.push({
        name,
        status: 'failed',
        evidence: errorEvidence(error),
      });
      throw error;
    } finally {
      await save();
    }
  };
  try {
    await check('ordinary-bucket', () => checkCapabilities(client, config));
    // Persist exact keys before any write, including failed/uncertain requests.
    report.keys = [source, destination, browserKey];
    await save();
    await check('stream-put-get-head', async () => {
      const put = await client.send(
        new PutObjectCommand({
          ...options(source),
          Body: Readable.from([Buffer.from(svg)]),
          ContentLength: Buffer.byteLength(svg),
          ContentType: 'image/svg+xml',
        }),
      );
      assert.equal(put.VersionId, undefined, 'Unexpected version identity');
      const head = await client.send(new HeadObjectCommand(options(source)));
      assert.equal(head.ContentLength, Buffer.byteLength(svg));
      assert.equal(head.ContentType, 'image/svg+xml');
      assert.ok(head.ETag);
      assert.equal(head.VersionId, undefined);
      const read = await client.send(
        new GetObjectCommand({ ...options(source), IfMatch: head.ETag }),
      );
      assert.equal(await read.Body?.transformToString(), svg);
      const copy = await client.send(
        new CopyObjectCommand({
          ...options(destination),
          CopySource: `${bucket}/${source.split('/').map(encodeURIComponent).join('/')}`,
          CopySourceIfMatch: head.ETag,
        }),
      );
      assert.ok(
        copy.CopyObjectResult?.ETag,
        'Copy must contain a successful result',
      );
      const fixed = await client.send(
        new GetObjectCommand(options(destination)),
      );
      assert.equal(await fixed.Body?.transformToString(), svg);
      await client.send(
        new PutObjectCommand({ ...options(source), Body: svg + '\n' }),
      );
      await assert.rejects(
        client.send(
          new GetObjectCommand({ ...options(source), IfMatch: head.ETag }),
        ),
        (error) =>
          errorEvidence(error).name === 'PreconditionFailed' &&
          errorEvidence(error).httpStatusCode === 412,
      );
      await assert.rejects(
        client.send(
          new CopyObjectCommand({
            ...options(destination),
            CopySource: `${bucket}/${source.split('/').map(encodeURIComponent).join('/')}`,
            CopySourceIfMatch: head.ETag,
          }),
        ),
        (error) =>
          errorEvidence(error).name === 'PreconditionFailed' &&
          errorEvidence(error).httpStatusCode === 412,
      );
      const unchanged = await client.send(
        new GetObjectCommand(options(destination)),
      );
      assert.equal(
        await unchanged.Body?.transformToString(),
        svg,
        'Failed conditional copy must not overwrite destination',
      );
      return {
        put: put.$metadata,
        head,
        copy,
        staleGetAndCopy: 412,
        fixedBytesUnchanged: true,
      };
    });
    await check('anonymous-private-get', async () =>
      checkAnonymous(await unsignedObjectUrl(client, bucket, source)),
    );
    await check('signed-get-overrides-and-head-metadata', async () => {
      const signed = await signReads(client, bucket, destination);
      const get = await fetch(signed.get, {
        headers: { 'Accept-Encoding': 'identity' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      const getEvidence = checkResponseHeaders(get);
      assert.equal(await get.text(), svg);
      const head = await fetch(signed.head, {
        method: 'HEAD',
        headers: { 'Accept-Encoding': 'identity' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      assert.equal(head.status, 200);
      assert.equal(
        Number(head.headers.get('content-length')),
        Buffer.byteLength(svg),
      );
      assert.equal(head.headers.get('content-type'), 'image/svg+xml');
      assert.ok(head.headers.get('etag'));
      assert.equal(head.headers.get('etag'), get.headers.get('etag'));
      const headEvidence = {
        status: head.status,
        headers: Object.fromEntries(head.headers),
      };
      assert.equal(await head.text(), '');
      const wrongMethod = await fetch(signed.get, {
        method: 'HEAD',
        headers: { 'Accept-Encoding': 'identity' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      assert.equal(
        wrongMethod.status,
        403,
        'GET signature must not authorize HEAD',
      );
      const headAsGet = await fetch(signed.head, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      await headAsGet.arrayBuffer();
      assert.equal(
        headAsGet.status,
        403,
        'HEAD signature must not authorize GET',
      );
      return {
        get: { ...signatureEvidence(signed.get), ...getEvidence },
        head: { ...signatureEvidence(signed.head), ...headEvidence },
        wrongMethodStatus: wrongMethod.status,
        headAsGetStatus: headAsGet.status,
      };
    });
    if (browser) {
      await check('browser-put-and-svg-download', async () => {
        // Retain the writable deadline even when the browser fails or exits.
        report.putValidUntil = new Date(Date.now() + 900_000).toISOString();
        await save();
        const signed = await signProbe(client, bucket, browserKey);
        const result = await browser(signed);
        const head = await client.send(
          new HeadObjectCommand(options(browserKey)),
        );
        assert.equal(head.ContentLength, Buffer.byteLength(svg));
        const read = await client.send(
          new GetObjectCommand(options(browserKey)),
        );
        assert.equal(await read.Body?.transformToString(), svg);
        return {
          put: signatureEvidence(signed.put),
          requiredHeaders: signed.headers,
          browser: result,
          independentHead: head,
          bytesVerified: true,
        };
      });
    } else
      report.checks.push({
        name: 'browser-put-and-svg-download',
        status: 'incomplete',
        evidence:
          'EGO_TASK_SPACE is required; server requests cannot verify browser CORS or download behavior',
      });
  } catch (error) {
    if (!report.checks.some((item) => item.status === 'failed'))
      report.checks.push({
        name: 'experiment-runner',
        status: 'failed',
        evidence: errorEvidence(error),
      });
  } finally {
    for (const key of report.keys) {
      try {
        await check(`delete:${key}`, async () => {
          const deleted = await client.send(
            new DeleteObjectCommand(options(key)),
          );
          assert.notEqual(deleted.DeleteMarker, true);
          assert.equal(deleted.VersionId, undefined);
          await assert.rejects(
            client.send(new HeadObjectCommand(options(key))),
            (error) =>
              errorEvidence(error).name === 'NotFound' &&
              errorEvidence(error).httpStatusCode === 404,
          );
          return {
            ...deleted,
            deletedNow: true,
            ...(key === browserKey && report.putValidUntil
              ? {
                  writableUntil: report.putValidUntil,
                  finalCleanup:
                    'Not proven; retain exact key for follow-up (UPLOAD-V01)',
                }
              : {}),
          };
        });
      } catch {
        /* Continue cleanup of the other exact keys; failure remains in report. */
      }
    }
    if (report.putValidUntil)
      report.checks.push({
        name: 'final-cleanup-after-writable-window',
        status: 'incomplete',
        evidence: {
          key: browserKey,
          writableUntil: report.putValidUntil,
          reason:
            'Deletion now does not revoke PUT or prove in-flight uploads have ended. Retain this key and record follow-up cleanup; full late-PUT protocol belongs to UPLOAD-V01.',
        },
      });
    client.destroy();
    report.status = report.checks.some((item) => item.status === 'failed')
      ? 'failed'
      : report.checks.some((item) => item.status === 'incomplete')
        ? 'incomplete'
        : 'passed';
    await save();
  }
  return report;
}
