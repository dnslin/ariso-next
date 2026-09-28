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
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  function scope(signal?: AbortSignal) {
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(
      () => controller.abort(new Error('S3 operation exceeded 1800 seconds')),
      1_800_000,
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
    let message = error instanceof Error ? error.message : String(cause);
    // S3 may echo credentials or a signed request in its XML error. Keep useful diagnostics, not secrets.
    message = message.replace(
      /https?:\/\/[^\s<>"']*X-Amz-[^\s<>"']*/gi,
      '[signed URL redacted]',
    );
    for (const secret of Object.values(config.credentials)) {
      if (secret)
        message = message
          .replaceAll(secret, '[redacted]')
          .replaceAll(encodeURIComponent(secret), '[redacted]');
    }
    const safeCause = Object.assign(new Error(message), {
      name: error?.name ?? 'Error',
      code: error?.code,
    });
    const metadata = error?.$metadata ?? responseMetadata;
    return Object.assign(
      new Error(
        `Storage ${operation} failed: ${config.id}, ${key}: ${message}`,
        { cause: safeCause },
      ),
      {
        code:
          metadata?.httpStatusCode === 412
            ? 'STORAGE_OBJECT_CHANGED'
            : metadata?.httpStatusCode === 404
              ? 'STORAGE_OBJECT_MISSING'
              : 'STORAGE_OPERATION_FAILED',
        storageId: config.id,
        key,
        operation,
        serviceCode: error?.name,
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
  ) {
    const request = scope(options.signal);
    try {
      request.signal.throwIfAborted();
      return await perform(request.signal, request.abort);
    } catch (cause) {
      throw failure(cause, key, operation);
    } finally {
      request.close();
    }
  }
  return {
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
