import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StorageConfig } from '../storage/schema.ts';
import { resolveUploadStorage } from '../storage/defaults.ts';
import { requireLocalStorage } from '../storage/settings.ts';
import { clientConfig } from '../storage/probes.ts';
import { createS3Storage } from '../storage/s3.ts';
import * as local from '../storage/local.ts';
import { mediaError } from './errors.ts';
import { createMediaResources } from './resources.ts';
import type { MediaRuntime } from './process.ts';

function remoteStorage(runtime: MediaRuntime, config: StorageConfig) {
  if (!runtime.secretCrypto)
    throw mediaError(
      'STORAGE_CONFIGURATION_MISSING',
      'S3 媒体处理缺少运行时密钥',
    );
  return createS3Storage({
    ...clientConfig({ secretCrypto: runtime.secretCrypto }, config),
    enabled: config.enabled,
  });
}

export async function readMediaObject(
  runtime: MediaRuntime,
  config: StorageConfig,
  key: string,
  mime: string,
  signal?: AbortSignal,
): Promise<{ stream: Readable; path?: string }> {
  config = resolveUploadStorage(runtime.db, config.id);
  if (config.type === 'local') {
    requireLocalStorage(config);
    return local.readObject(runtime.storageRoot, config, key, mime, signal);
  }
  const storage = remoteStorage(runtime, config);
  try {
    const result = await storage.readObject(key, { signal });
    result.stream.once('close', () => storage.destroy());
    return result;
  } catch (error) {
    storage.destroy();
    throw error;
  }
}

/** Only S3 sources need a local file; callers keep it outside the decoder cache. */
export async function mediaSourcePath(
  runtime: MediaRuntime,
  config: StorageConfig,
  object: {
    id: string;
    key: string;
    mime: string | null;
    byteSize: number | null;
  },
  target: string,
  signal: AbortSignal,
) {
  if (config.type === 'local') {
    const source = await readMediaObject(
      runtime,
      config,
      object.key,
      object.mime!,
      signal,
    );
    source.stream.destroy();
    await once(source.stream, 'close');
    return source.path!;
  }
  await mkdir(dirname(target), { recursive: true });
  const resources = (runtime.resources ??= createMediaResources());
  let remaining = object.byteSize!;
  resources.reserveWrite(object.id, dirname(target), remaining);
  try {
    const source = await readMediaObject(
      runtime,
      config,
      object.key,
      object.mime!,
      signal,
    );
    const count = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          resources.reserveWrite(
            object.id,
            dirname(target),
            Math.max(remaining, chunk.length),
          );
          remaining = Math.max(0, remaining - chunk.length);
          resources.consumeWrite(object.id, chunk.length);
          callback(null, chunk);
        } catch (error) {
          callback(error as Error);
        }
      },
    });
    await pipeline(source.stream, count, createWriteStream(target), { signal });
    return target;
  } finally {
    resources.releaseWrite(object.id);
  }
}

/** S3 single PUT requires an actual ContentLength, so render once to the task's disk. */
export async function writeMediaObject(
  runtime: MediaRuntime,
  config: StorageConfig,
  plan: local.LocalWrite,
  source: Readable,
  mime: string,
  path: string,
  signal: AbortSignal,
): Promise<{ key: string; size: number; path?: string }> {
  config = resolveUploadStorage(runtime.db, config.id);
  if (config.type === 'local') {
    requireLocalStorage(config);
    return local.writeObject(runtime.storageRoot, config, plan, source, signal);
  }
  const output = createWriteStream(path, { flags: 'wx' });
  await pipeline(source, output, { signal });
  const storage = remoteStorage(
    runtime,
    resolveUploadStorage(runtime.db, config.id),
  );
  try {
    await storage.writeObject(plan.key, createReadStream(path), {
      size: output.bytesWritten,
      contentType: mime,
      signal,
    });
    return { key: plan.key, size: output.bytesWritten, path };
  } finally {
    storage.destroy();
  }
}

export async function inspectMediaObject(
  runtime: MediaRuntime,
  config: StorageConfig,
  key: string,
  signal?: AbortSignal,
) {
  if (config.type === 'local') {
    requireLocalStorage(config);
    return local.inspectObject(runtime.storageRoot, config, key);
  }
  const storage = remoteStorage(runtime, config);
  try {
    const result = await storage.inspectObject(key, {
      signal: AbortSignal.any([
        AbortSignal.timeout(30_000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (result && result.size === undefined)
      throw mediaError('STORAGE_OPERATION_FAILED', `S3 对象缺少字节数：${key}`);
    return result ? { size: result.size! } : null;
  } finally {
    storage.destroy();
  }
}

export async function deleteMediaObject(
  runtime: MediaRuntime,
  config: StorageConfig,
  key: string,
  signal?: AbortSignal,
) {
  if (config.type === 'local') {
    requireLocalStorage(config);
    return local.deleteObject(runtime.storageRoot, config, key);
  }
  const storage = remoteStorage(runtime, config);
  try {
    await storage.deleteObject(key, {
      signal: AbortSignal.any([
        AbortSignal.timeout(30_000),
        ...(signal ? [signal] : []),
      ]),
    });
  } finally {
    storage.destroy();
  }
}
