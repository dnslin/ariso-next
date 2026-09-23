import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { addAbortSignal, Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { services } from '../storage-s3/config.ts';
import { errorEvidence } from '../storage-s3/protocol.ts';
import { summarizeBoundary, type Outcome, type Sample } from './boundary.ts';

export const targetSchema = z.object({
  service: z.enum(services),
  endpoint: z.url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().optional(),
  }),
});
export type Target = z.infer<typeof targetSchema>;
type Operation = {
  stage: string;
  milliseconds: number;
  status: Outcome;
  evidence: unknown;
};
export type CapacityReport = ReturnType<typeof newReport>;

export function newReport(
  target: Pick<Target, 'service' | 'endpoint' | 'bucket'>,
) {
  return {
    ...target,
    startedAt: new Date().toISOString(),
    status: 'incomplete',
    errors: [] as unknown[],
    samples: [] as (Sample & {
      operations: Operation[];
      keys: string[];
      cleanup: unknown[];
    })[],
    boundary: summarizeBoundary([]),
  };
}

// A bounded stream, not a multi-gigabyte Buffer or a multipart S3 upload.
export function byteStream(bytes: number, hash = createHash('sha256')) {
  const block = Buffer.alloc(1024 * 1024, 0x61);
  return Readable.from(
    (function* () {
      for (let remaining = bytes; remaining > 0; remaining -= block.length) {
        const chunk = block.subarray(0, Math.min(remaining, block.length));
        hash.update(chunk);
        yield chunk;
      }
    })(),
  );
}

export async function probe(
  target: Target,
  sizes: number[],
  report: CapacityReport,
  save: () => Promise<void>,
  timeoutMs: number,
) {
  const client = new S3Client({
    ...target,
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: 10_000,
      requestTimeout: timeoutMs,
      throwOnRequestTimeout: true,
    },
  });
  const namespace = `ariso/upload-v02/${randomUUID()}`;
  try {
    for (const bytes of sizes) {
      const source = `${namespace}/${bytes}/source`;
      const destination = `${namespace}/${bytes}/copy`;
      const sample: CapacityReport['samples'][number] = {
        bytes,
        put: 'not-run',
        copy: 'not-run',
        operations: [],
        keys: [source, destination],
        cleanup: [],
      };
      report.samples.push(sample);
      await save();
      async function operation(
        stage: string,
        run: () => Promise<unknown>,
      ): Promise<Outcome> {
        const start = performance.now();
        try {
          const evidence = await run();
          sample.operations.push({
            stage,
            milliseconds: performance.now() - start,
            status: 'passed',
            evidence,
          });
          return 'passed';
        } catch (error) {
          const evidence = errorEvidence(error);
          const status =
            evidence.name === 'EntityTooLarge' ? 'size-rejected' : 'failed';
          sample.operations.push({
            stage,
            milliseconds: performance.now() - start,
            status,
            evidence,
          });
          return status;
        } finally {
          await save();
        }
      }
      const hash = createHash('sha256');
      const body = byteStream(bytes, hash);
      try {
        try {
          sample.put = await operation('single-put', async () => {
            const result = await client.send(
              new PutObjectCommand({
                Bucket: target.bucket,
                Key: source,
                Body: body,
                ContentLength: bytes,
                ContentType: 'application/octet-stream',
              }),
            );
            return { metadata: result.$metadata, etag: result.ETag };
          });
        } finally {
          body.destroy();
        }
        if (sample.put === 'passed') {
          const expectedHash = hash.digest('hex');
          const head = await client.send(
            new HeadObjectCommand({ Bucket: target.bucket, Key: source }),
          );
          assert.equal(head.ContentLength, bytes);
          assert.ok(head.ETag);
          sample.copy = await operation('single-copy', async () => {
            const result = await client.send(
              new CopyObjectCommand({
                Bucket: target.bucket,
                Key: destination,
                CopySource: `${target.bucket}/${source}`,
                CopySourceIfMatch: head.ETag,
              }),
            );
            return {
              metadata: result.$metadata,
              etag: result.CopyObjectResult?.ETag,
            };
          });
          if (sample.copy === 'passed') {
            const verified = await operation('copied-bytes', async () => {
              const signal = AbortSignal.timeout(timeoutMs);
              const result = await client.send(
                new GetObjectCommand({
                  Bucket: target.bucket,
                  Key: destination,
                }),
                { abortSignal: signal },
              );
              assert.ok(result.Body);
              const stream = addAbortSignal(signal, result.Body as Readable);
              try {
                assert.equal(result.ContentLength, bytes);
                const received = createHash('sha256');
                let count = 0;
                for await (const chunk of result.Body as Readable) {
                  count += chunk.length;
                  received.update(chunk);
                }
                assert.equal(count, bytes);
                assert.equal(received.digest('hex'), expectedHash);
                return {
                  bytes: count,
                  sha256: expectedHash,
                  metadata: result.$metadata,
                };
              } finally {
                stream.destroy();
              }
            });
            if (verified !== 'passed') sample.copy = 'failed';
          }
        }
      } catch (error) {
        sample.put = 'failed';
        sample.operations.push({
          stage: 'source-metadata',
          milliseconds: 0,
          status: 'failed',
          evidence: errorEvidence(error),
        });
      } finally {
        for (const key of sample.keys) {
          try {
            const result = await client.send(
              new DeleteObjectCommand({ Bucket: target.bucket, Key: key }),
            );
            sample.cleanup.push({
              key,
              status:
                result.DeleteMarker || result.VersionId
                  ? 'version-retained'
                  : 'deleted',
              deleteMarker: result.DeleteMarker,
              versionId: result.VersionId,
              metadata: result.$metadata,
            });
          } catch (error) {
            sample.cleanup.push({
              key,
              status: 'failed',
              error: errorEvidence(error),
            });
          }
        }
        report.boundary = summarizeBoundary(report.samples);
        await save();
      }
    }
  } finally {
    client.destroy();
  }
}
