import { describe, expect, it } from 'vitest';
import { configSchema } from '../../experiments/storage-s3/config.ts';
import {
  createClient,
  errorEvidence,
  signProbe,
  signatureEvidence,
  unsignedObjectUrl,
} from '../../experiments/storage-s3/protocol.ts';

const base = {
  service: 'minio' as const,
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  bucket: 'probe',
  forcePathStyle: true,
  credentials: { accessKeyId: 'test-key', secretAccessKey: 'test-secret' },
  serviceVersion: 'test only',
  revision: '1',
  ownerConfirmation: {
    revision: '1',
    privateBucketAndNoPublicAliases: true as const,
    evidence: 'unit fixture',
  },
};
describe('S3 experiment configuration and actual SDK signatures', () => {
  it('requires an entire-bucket R2 confirmation tied to this revision and official endpoint', () => {
    expect(configSchema.safeParse({ ...base, service: 'r2' }).success).toBe(
      false,
    );
    const r2 = {
      ...base,
      service: 'r2',
      endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
      ownerConfirmation: {
        ...base.ownerConfirmation,
        wholeBucketHasNoLockRules: true,
      },
    };
    expect(configSchema.safeParse(r2).success).toBe(true);
    expect(configSchema.safeParse({ ...r2, revision: '2' }).success).toBe(
      false,
    );
    expect(
      configSchema.safeParse({ ...r2, endpoint: 'https://r2.example.com' })
        .success,
    ).toBe(false);
  });
  it('signs PUT for 900 seconds without an empty-body checksum, GET and HEAD separately for 300 seconds', async () => {
    const client = createClient(base);
    try {
      const signed = await signProbe(client, base.bucket, '目录/a +%?.svg');
      const put = signatureEvidence(signed.put);
      expect(put.expires).toBe('900');
      expect(put.signedHeaders?.split(';')).toContain('content-type');
      expect(
        Object.keys(put.query).filter((name) => /checksum|crc/i.test(name)),
      ).toEqual([]);
      expect(signatureEvidence(signed.get).expires).toBe('300');
      expect(signatureEvidence(signed.head).expires).toBe('300');
      expect(new URL(signed.get).searchParams.get('X-Amz-Signature')).not.toBe(
        new URL(signed.head).searchParams.get('X-Amz-Signature'),
      );
      for (const url of [signed.get, signed.head]) {
        expect(new URL(url).searchParams.get('response-content-type')).toBe(
          'application/octet-stream',
        );
        expect(
          new URL(url).searchParams.get('response-content-disposition'),
        ).toContain('attachment;');
        expect(new URL(url).searchParams.get('response-cache-control')).toBe(
          'private, no-store, no-transform',
        );
      }
      expect(JSON.stringify(put)).not.toMatch(
        /test-key|test-secret|X-Amz-Signature|X-Amz-Credential/,
      );
      expect(
        await unsignedObjectUrl(client, base.bucket, '目录/a +%?.svg'),
      ).toBe(
        'http://127.0.0.1:9000/probe/%E7%9B%AE%E5%BD%95/a%20%2B%25%3F.svg',
      );
    } finally {
      client.destroy();
    }
  });
});

it('错误证据保留地址和诊断但移除预签名凭据', () => {
  const error = Object.assign(
    new Error(
      'GET https://bucket.example/key?X-Amz-Credential=key%2Fscope&X-Amz-Signature=signature&X-Amz-Security-Token=session failed',
    ),
    { $metadata: { httpStatusCode: 403, requestId: 'request-1' } },
  );
  expect(errorEvidence(error)).toEqual({
    name: 'Error',
    message:
      'GET https://bucket.example/key?X-Amz-Credential=[redacted]&X-Amz-Signature=[redacted]&X-Amz-Security-Token=[redacted] failed',
    httpStatusCode: 403,
    requestId: 'request-1',
  });
});
