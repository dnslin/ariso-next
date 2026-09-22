import assert from 'node:assert/strict';
import {
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from './config.ts';

export const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>';
export const overrides = {
  ResponseContentType: 'application/octet-stream',
  ResponseContentDisposition:
    'attachment; filename="image.svg"; filename*=UTF-8\'\'%E6%97%85%E8%A1%8C.svg',
  ResponseCacheControl: 'private, no-store, no-transform',
};
export function createClient(config: StorageConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 1,
    requestHandler: {
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
      throwOnRequestTimeout: true,
    },
  });
}

export function errorEvidence(error: unknown) {
  if (!(error instanceof Error))
    return { name: 'UnknownError', message: String(error) };
  const metadata =
    '$metadata' in error
      ? (error.$metadata as {
          httpStatusCode?: number;
          requestId?: string;
          extendedRequestId?: string;
        })
      : undefined;
  return {
    name: error.name,
    message: error.message.replace(
      /(X-Amz-(?:Credential|Signature|Security-Token)=)[^&\s"'<>]+/gi,
      '$1[redacted]',
    ),
    ...metadata,
  };
}

export async function checkCapabilities(
  client: S3Client,
  config: StorageConfig,
) {
  if (config.service === 'r2')
    return {
      basis: 'official-capability-and-owner-confirmation',
      automaticVersionOrLockDetection: false,
      capabilitySource: 'https://developers.cloudflare.com/r2/api/s3/api/',
      ...config.ownerConfirmation,
    };
  const versioning = await client.send(
    new GetBucketVersioningCommand({ Bucket: config.bucket }),
  );
  assert.equal(
    versioning.Status,
    undefined,
    `Unsupported versioning: ${versioning.Status}`,
  );
  let lock;
  try {
    lock = await client.send(
      new GetObjectLockConfigurationCommand({ Bucket: config.bucket }),
    );
  } catch (error) {
    const evidence = errorEvidence(error);
    assert.ok(
      evidence.name === 'ObjectLockConfigurationNotFoundError' &&
        evidence.httpStatusCode === 404,
      `Lock configuration unknown: ${JSON.stringify(evidence)}`,
    );
    return { basis: 'configuration-apis', versioning, lock: evidence };
  }
  // An empty/unknown successful response is not proof of an unlocked bucket.
  throw new Error(
    `Object lock is enabled or unconfirmed: ${JSON.stringify(lock)}`,
  );
}

// Resolve through the SDK serializer/endpoint rules before signing; never strip a signed URL.
export async function unsignedObjectUrl(
  client: S3Client,
  bucket: string,
  key: string,
) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  let url: string | undefined;
  command.middlewareStack.add(
    () =>
      async ({ request }) => {
        const value = request as {
          protocol: string;
          hostname: string;
          port?: number;
          path: string;
        };
        url = `${value.protocol}//${value.hostname}${value.port ? `:${value.port}` : ''}${value.path}`;
        return { response: {}, output: { $metadata: {} } };
      },
    { name: 'captureUnsignedObjectAddress', step: 'build', priority: 'high' },
  );
  await client.send(command);
  assert.ok(url);
  return url;
}

export async function checkAnonymous(url: string) {
  const response = await fetch(url, {
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  assert.equal(
    response.status,
    403,
    `Anonymous GET returned ${response.status}`,
  );
  assert.match(
    body,
    /<Code>AccessDenied<\/Code>/,
    '403 must be an object-service AccessDenied response',
  );
  return {
    url,
    status: response.status,
    code: 'AccessDenied',
    requestId: response.headers.get('x-amz-request-id'),
  };
}

export async function signProbe(client: S3Client, bucket: string, key: string) {
  const input = { Bucket: bucket, Key: key };
  const put = await getSignedUrl(
    client,
    new PutObjectCommand({ ...input, ContentType: 'image/svg+xml' }),
    { expiresIn: 900, signableHeaders: new Set(['content-type']) },
  );
  return {
    put,
    ...(await signReads(client, bucket, key)),
    headers: { 'content-type': 'image/svg+xml' },
  };
}

export async function signReads(client: S3Client, bucket: string, key: string) {
  const input = { Bucket: bucket, Key: key };
  const get = await getSignedUrl(
    client,
    new GetObjectCommand({ ...input, ...overrides }),
    { expiresIn: 300 },
  );
  const head = await getSignedUrl(
    client,
    new HeadObjectCommand({ ...input, ...overrides }),
    { expiresIn: 300 },
  );
  return { get, head };
}

export function signatureEvidence(url: string) {
  const parsed = new URL(url);
  return {
    url: `${parsed.origin}${parsed.pathname}`,
    expires: parsed.searchParams.get('X-Amz-Expires'),
    signedHeaders: parsed.searchParams.get('X-Amz-SignedHeaders'),
    query: Object.fromEntries(
      [...parsed.searchParams].filter(
        ([key]) => !/^X-Amz-(Credential|Signature|Security-Token)$/i.test(key),
      ),
    ),
  };
}

export function checkResponseHeaders(response: Response) {
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    overrides.ResponseContentType,
  );
  assert.equal(
    response.headers.get('content-disposition'),
    overrides.ResponseContentDisposition,
  );
  assert.equal(
    response.headers.get('cache-control'),
    overrides.ResponseCacheControl,
  );
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
  };
}
