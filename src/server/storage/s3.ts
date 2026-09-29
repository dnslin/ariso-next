import {
  PassThrough,
  Readable,
  addAbortSignal,
  finished as observeStream,
} from 'node:stream';
import { finished } from 'node:stream/promises';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DOMParser } from '@xmldom/xmldom';

export type S3StorageConfig = {
  id: string;
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  forcePathStyle: boolean;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};
type RequestOptions = { signal?: AbortSignal };
type ReadSignature =
  | {
      method: 'GET';
      contentType: string;
      contentDisposition: string;
      cacheControl: string;
    }
  | { method: 'HEAD' };

function validateKey(key: string) {
  if (
    !key ||
    /[\x00-\x1f\x7f\\]/.test(key) ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Invalid S3 object key: ${JSON.stringify(key)}`);
  }
  return key;
}

// Configuration and error XML are tiny. Stop broken gateways from streaming arbitrary bodies into memory.
async function readProbeXml(body: Readable, signal: AbortSignal) {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of addAbortSignal(signal, body)) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 65_536) throw new Error('S3 probe XML exceeds 64 KiB');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  } finally {
    body.destroy();
  }
}

/** Configuration is a current caller-owned snapshot; configuration persistence belongs to T-STO-03.
 * Reuse for that operation group, destroy at its end. Callers register keys BEFORE any writes/signing.
 */
export function createS3Storage(config: S3StorageConfig) {
  if (
    !config.endpoint ||
    !config.region ||
    !config.bucket ||
    !config.credentials?.accessKeyId ||
    !config.credentials.secretAccessKey
  ) {
    throw new Error(
      'S3 requires explicit endpoint, region, bucket and credentials',
    );
  }
  const prefix = config.pathPrefix.replace(/^\/+|\/+$/g, '');
  validateKey(config.id);
  if (config.id.includes('/')) throw new Error('Invalid storage id');
  if (prefix) validateKey(prefix);
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // Persistent cleanup retries belong to the owning task. Streams cannot be replayed by the SDK.
    maxAttempts: 1,
    requestHandler: {
      connectionTimeout: 10_000,
      socketTimeout: 120_000,
      requestTimeout: 1_800_000,
      throwOnRequestTimeout: true,
    },
  });
  const active = new Set<AbortController>();
  function scope(signal?: AbortSignal, timeoutMs = 1_800_000) {
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(
      () =>
        controller.abort(
          Object.assign(
            new Error(`S3 operation exceeded ${timeoutMs / 1000} seconds`),
            { code: 'STORAGE_TIMEOUT' },
          ),
        ),
      timeoutMs,
    );
    timer.unref();
    return {
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
      abort(reason: Error) {
        controller.abort(reason);
      },
      close() {
        clearTimeout(timer);
        active.delete(controller);
      },
    };
  }
  function object(key: string) {
    const Key = `${prefix ? `${prefix}/` : ''}ariso/${config.id}/${validateKey(key)}`;
    if (Buffer.byteLength(Key) > 1024)
      throw new Error('S3 object key exceeds 1024 bytes');
    return { Bucket: config.bucket, Key };
  }
  function enabled() {
    if (!config.enabled)
      throw Object.assign(new Error(`Storage disabled: ${config.id}`), {
        code: 'STORAGE_DISABLED',
        storageId: config.id,
      });
  }
  function failure(
    cause: unknown,
    key: string,
    operation: string,
    responseMetadata?: GetObjectCommandOutput['$metadata'],
  ) {
    const error = cause as Error & {
      code?: string;
      $metadata?: GetObjectCommandOutput['$metadata'];
    };
    if (error?.code === 'STORAGE_DISABLED') return error;
    // S3 may echo credentials or a signed request in any error field.
    function redact(value: string) {
      let safe = value.replace(
        /https?:\/\/[^\s<>"']*X-Amz-[^\s<>"']*/gi,
        '[signed URL redacted]',
      );
      for (const secret of Object.values(config.credentials)) {
        if (secret)
          safe = safe
            .replaceAll(secret, '[redacted]')
            .replaceAll(encodeURIComponent(secret), '[redacted]');
      }
      return safe;
    }
    const message = redact(
      error instanceof Error ? error.message : String(cause),
    );
    const safeCause = Object.assign(new Error(message), {
      name: redact(error?.name ?? 'Error'),
      code: error?.code ? redact(String(error.code)) : undefined,
    });
    const metadata = error?.$metadata ?? responseMetadata;
    return Object.assign(
      new Error(
        `Storage ${operation} failed: ${config.id}, ${key}: ${message}`,
        { cause: safeCause },
      ),
      {
        code:
          error?.code === 'STORAGE_BUCKET_UNSUPPORTED' ||
          error?.code === 'STORAGE_TIMEOUT'
            ? error.code
            : metadata?.httpStatusCode === 412
              ? 'STORAGE_OBJECT_CHANGED'
              : metadata?.httpStatusCode === 404
                ? 'STORAGE_OBJECT_MISSING'
                : 'STORAGE_OPERATION_FAILED',
        storageId: config.id,
        key,
        operation,
        serviceCode: error?.name ? redact(error.name) : undefined,
        httpStatusCode: metadata?.httpStatusCode,
        requestId: metadata?.requestId,
        metadata,
      },
    );
  }
  async function run<T>(
    key: string,
    operation: string,
    options: RequestOptions,
    perform: (
      signal: AbortSignal,
      abort: (reason: Error) => void,
    ) => Promise<T>,
    timeoutMs?: number,
  ) {
    const request = scope(options.signal, timeoutMs);
    try {
      request.signal.throwIfAborted();
      return await perform(request.signal, request.abort);
    } catch (cause) {
      const reason = request.signal.reason as
        { name?: string; code?: string } | undefined;
      if (
        request.signal.aborted &&
        (reason?.name === 'TimeoutError' || reason?.code === 'STORAGE_TIMEOUT')
      ) {
        throw failure(
          Object.assign(new Error('S3 operation timed out', { cause }), {
            code: 'STORAGE_TIMEOUT',
          }),
          key,
          operation,
        );
      }
      throw failure(cause, key, operation);
    } finally {
      request.close();
    }
  }
  const endpoint = new URL(config.endpoint);
  const officialR2 =
    endpoint.protocol === 'https:' &&
    !endpoint.port &&
    endpoint.pathname === '/' &&
    !endpoint.search &&
    !endpoint.hash &&
    /^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(
      endpoint.hostname,
    );
  function unsupported(message: string) {
    return Object.assign(new Error(message), {
      code: 'STORAGE_BUCKET_UNSUPPORTED',
    });
  }
  return {
    /** R2's lock statement is supplied by the owner for this revision, not inferred from an unsupported API. */
    async checkBucket(
      options: RequestOptions & { r2NoBucketLocksConfirmed?: boolean } = {},
    ) {
      return run(
        '',
        'check-bucket',
        options,
        async (signal) => {
          if (officialR2) {
            if (!options.r2NoBucketLocksConfirmed)
              throw unsupported(
                'Confirm that the entire R2 bucket has no bucket lock rules',
              );
            return {
              basis: 'official-capability-and-owner-confirmation' as const,
              automaticVersionOrLockDetection: false,
              capabilitySource:
                'https://developers.cloudflare.com/r2/api/s3/api/',
              r2NoBucketLocksConfirmed: true,
            };
          }
          const versionCommand = new GetBucketVersioningCommand({
            Bucket: config.bucket,
          });
          // Smithy's XML deserializer ignores the root name; validate it before an unknown document can look unversioned.
          versionCommand.middlewareStack.add(
            (next) => async (args) => {
              const result = await next(args);
              const response = result.response as {
                statusCode: number;
                headers: Record<string, string>;
                body: Readable | Uint8Array;
              };
              if (response.statusCode >= 200 && response.statusCode < 300) {
                try {
                  if (response.statusCode !== 200) {
                    if (response.body instanceof Readable)
                      response.body.destroy();
                    throw new Error(
                      'Expected HTTP 200 versioning configuration',
                    );
                  }
                  const body = await readProbeXml(
                    response.body instanceof Readable
                      ? response.body
                      : Readable.from([response.body]),
                    signal,
                  );
                  const document = new DOMParser({
                    onError: () => {
                      throw new Error('Invalid versioning XML');
                    },
                  }).parseFromString(body.toString('utf8'), 'application/xml');
                  if (
                    document.documentElement?.localName !==
                    'VersioningConfiguration'
                  )
                    throw new Error(
                      'Expected VersioningConfiguration XML response',
                    );
                  response.body = body;
                } catch (cause) {
                  throw Object.assign(
                    new Error('Bucket versioning could not be confirmed', {
                      cause,
                    }),
                    {
                      name: 'InvalidVersioningResponse',
                      $metadata: {
                        httpStatusCode: response.statusCode,
                        requestId: response.headers['x-amz-request-id'],
                      },
                    },
                  );
                }
              }
              return result;
            },
            {
              name: 'validateVersioningXml',
              step: 'deserialize',
              priority: 'low',
            },
          );
          const versioning = await client.send(versionCommand, {
            abortSignal: signal,
          });
          if (versioning.Status !== undefined)
            throw unsupported(
              `Unsupported bucket versioning: ${versioning.Status}`,
            );
          try {
            await client.send(
              new GetObjectLockConfigurationCommand({ Bucket: config.bucket }),
              { abortSignal: signal },
            );
          } catch (cause) {
            const error = cause as Error & {
              $metadata?: GetObjectCommandOutput['$metadata'];
            };
            if (
              error.name !== 'ObjectLockConfigurationNotFoundError' ||
              error.$metadata?.httpStatusCode !== 404
            )
              throw cause;
            return {
              basis: 'configuration-apis' as const,
              automaticVersionOrLockDetection: true,
              versioning: {
                status: 'unversioned',
                metadata: versioning.$metadata,
              },
              lock: {
                status: 'not-configured',
                serviceCode: error.name,
                metadata: error.$metadata,
              },
            };
          }
          throw unsupported(
            'Bucket object lock is enabled or its absence could not be confirmed',
          );
        },
        30_000,
      );
    },
    /** Call only after an authenticated read has verified this same registered probe object. */
    async checkAnonymous(key: string, options: RequestOptions = {}) {
      return run(
        key,
        'anonymous-read',
        options,
        async (signal) => {
          const command = new GetObjectCommand(object(key));
          let url: string | undefined;
          // Use the SDK's own endpoint and key serializer BEFORE signing. There is no network request here.
          command.middlewareStack.add(
            () =>
              async ({ request }) => {
                const address = request as {
                  protocol: string;
                  hostname: string;
                  port?: number;
                  path: string;
                };
                url = `${address.protocol}//${address.hostname}${address.port ? `:${address.port}` : ''}${address.path}`;
                return { response: {}, output: { $metadata: {} } };
              },
            {
              name: 'captureAnonymousObjectUrl',
              step: 'build',
              priority: 'high',
            },
          );
          await client.send(command, { abortSignal: signal });
          if (!url)
            throw new Error('SDK did not resolve the anonymous object address');
          const response = await fetch(url, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'omit',
            signal,
          });
          let serviceCode: string | undefined;
          let message: string | undefined;
          let requestId = response.headers.get('x-amz-request-id') ?? undefined;
          // A successful anonymous response already proves public access. Other responses need a real S3 error document.
          if (
            response.status === 400 ||
            response.status === 403 ||
            response.status >= 500
          ) {
            try {
              const body = response.body
                ? (
                    await readProbeXml(
                      Readable.fromWeb(
                        response.body as import('node:stream/web').ReadableStream<Uint8Array>,
                      ),
                      signal,
                    )
                  ).toString('utf8')
                : '';
              const document = new DOMParser({
                onError: () => {
                  throw new Error('Invalid S3 error XML');
                },
              }).parseFromString(body, 'application/xml');
              const root = document.documentElement;
              if (root?.localName === 'Error') {
                const field = (name: string) =>
                  Array.from(root.childNodes).find(
                    (node) => node.nodeType === 1 && node.nodeName === name,
                  )?.textContent ?? undefined;
                serviceCode = field('Code');
                message = field('Message');
                requestId ??= field('RequestId');
              }
            } catch (cause) {
              throw Object.assign(
                new Error('Invalid S3 error XML', { cause }),
                {
                  name: 'InvalidS3ErrorResponse',
                  $metadata: { httpStatusCode: response.status, requestId },
                },
              );
            }
          } else {
            await response.body?.cancel();
          }
          const accessDenied =
            response.status === 403 && serviceCode === 'AccessDenied';
          const r2Denied =
            officialR2 &&
            response.status === 400 &&
            serviceCode === 'InvalidArgument' &&
            message === 'Authorization';
          if (!accessDenied && !r2Denied)
            throw Object.assign(
              new Error(
                `Anonymous object read was not explicitly denied: HTTP ${response.status}, ${message ?? 'unknown response'}`,
              ),
              {
                name: serviceCode ?? 'AnonymousAccessUnconfirmed',
                $metadata: { httpStatusCode: response.status, requestId },
              },
            );
          return {
            url,
            httpStatusCode: response.status,
            serviceCode,
            requestId,
            basis: r2Denied
              ? ('r2-authorization-required' as const)
              : ('access-denied' as const),
          };
        },
        30_000,
      );
    },
    async writeObject(
      key: string,
      source: Readable,
      options: RequestOptions & { size: number; contentType: string },
    ) {
      try {
        enabled();
        return await run(key, 'write', options, async (signal, abort) => {
          let inputError: Error | undefined;
          const stopObserving = observeStream(
            source,
            { readable: true, writable: false },
            (error) => {
              if (error) {
                inputError = error;
                abort(error);
              }
            },
          );
          try {
            const result = await client.send(
              new PutObjectCommand({
                ...object(key),
                Body: addAbortSignal(signal, source),
                ContentLength: options.size,
                ContentType: options.contentType,
              }),
              { abortSignal: signal },
            );
            return { etag: result.ETag, metadata: result.$metadata };
          } catch (cause) {
            throw inputError ?? cause;
          } finally {
            stopObserving();
          }
        });
      } finally {
        source.destroy();
        // The original operation/stream error is retained above; disposal may repeat it.
        await finished(source, { cleanup: true }).catch(() => undefined);
      }
    },
    async readObject(
      key: string,
      options: RequestOptions & { ifMatch?: string } = {},
    ) {
      enabled();
      const request = scope(options.signal);
      try {
        request.signal.throwIfAborted();
        const result = await client.send(
          new GetObjectCommand({ ...object(key), IfMatch: options.ifMatch }),
          { abortSignal: request.signal },
        );
        const body = result.Body;
        if (!(body instanceof Readable))
          throw new Error('S3 did not return a Node readable body');
        addAbortSignal(request.signal, body);
        const stream = new PassThrough();
        // Pipe preserves backpressure. Closing the consumer must destroy the HTTP body
        // immediately, including while the remote peer has stopped sending bytes.
        stream.once('close', () => {
          body.destroy();
          request.close();
        });
        body.once('end', () => request.close());
        body.once('error', (cause) =>
          stream.destroy(failure(cause, key, 'read', result.$metadata)),
        );
        body.pipe(stream);
        return {
          stream,
          size: result.ContentLength,
          contentType: result.ContentType,
          etag: result.ETag,
          metadata: result.$metadata,
        };
      } catch (cause) {
        request.close();
        throw failure(cause, key, 'read');
      }
    },
    /** Maintenance HEAD is also needed after disabling a configuration. */
    async inspectObject(key: string, options: RequestOptions = {}) {
      return run(key, 'inspect', options, async (signal) => {
        try {
          const result = await client.send(new HeadObjectCommand(object(key)), {
            abortSignal: signal,
          });
          return {
            size: result.ContentLength,
            contentType: result.ContentType,
            etag: result.ETag,
            metadata: result.$metadata,
          };
        } catch (cause) {
          if (
            (cause as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode === 404
          )
            return null;
          throw cause;
        }
      });
    },
    /** The owner must use a fresh destination key and the SAME ETag used to validate source bytes. */
    async copyObject(
      sourceKey: string,
      key: string,
      etag: string,
      options: RequestOptions = {},
    ) {
      enabled();
      return run(key, 'copy', options, async (signal) => {
        if (!etag)
          throw new Error(
            'Conditional copy requires the validated source ETag',
          );
        const source = object(sourceKey);
        const CopySource = `${source.Bucket}/${source.Key.split('/').map(encodeURIComponent).join('/')}`;
        const result = await client.send(
          new CopyObjectCommand({
            ...object(key),
            CopySource,
            CopySourceIfMatch: etag,
          }),
          { abortSignal: signal },
        );
        return {
          etag: result.CopyObjectResult?.ETag,
          metadata: result.$metadata,
        };
      });
    },
    /** Delete exactly the registered key, even while disabled. Never clears the owner's durable reference. */
    async deleteObject(key: string, options: RequestOptions = {}) {
      return run(key, 'delete', options, async (signal) => {
        const result = await client.send(new DeleteObjectCommand(object(key)), {
          abortSignal: signal,
        });
        if (
          result.DeleteMarker ||
          (result.VersionId && result.VersionId !== 'null')
        )
          throw new Error(
            'S3 deletion returned versioned-object state; cleanup is not complete',
          );
        return { metadata: result.$metadata };
      });
    },
    async signUpload(key: string, contentType: string) {
      enabled();
      return run(key, 'sign-upload', {}, async () => {
        const input = object(key);
        if (!/^(uploads\/[^/]+\/[^/]+|probes\/[^/]+)$/.test(key))
          throw new Error(
            'PUT signing requires a temporary upload or probe key',
          );
        const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000);
        const url = await getSignedUrl(
          client,
          new PutObjectCommand({ ...input, ContentType: contentType }),
          {
            expiresIn: 900,
            signingDate,
            signableHeaders: new Set(['content-type']),
          },
        );
        return {
          url,
          method: 'PUT' as const,
          headers: { 'content-type': contentType },
          expiresAt: new Date(signingDate.getTime() + 900_000),
          key,
        };
      });
    },
    async signRead(key: string, options: ReadSignature) {
      enabled();
      return run(key, 'sign-read', {}, async () => {
        const input = object(key);
        const command =
          options.method === 'HEAD'
            ? new HeadObjectCommand(input)
            : new GetObjectCommand({
                ...input,
                ResponseContentType: options.contentType,
                ResponseContentDisposition: options.contentDisposition,
                ResponseCacheControl: options.cacheControl,
              });
        const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000);
        const url = await getSignedUrl(client, command, {
          expiresIn: 300,
          signingDate,
        });
        return {
          url,
          method: options.method,
          headers: {},
          expiresAt: new Date(signingDate.getTime() + 300_000),
          key,
        };
      });
    },
    destroy() {
      for (const controller of active)
        controller.abort(new Error('S3 client destroyed'));
      client.destroy();
    },
  };
}
