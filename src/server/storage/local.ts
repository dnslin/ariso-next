import { createWriteStream } from 'node:fs';
import { lstat, open, opendir, rename, stat, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import {
  accessSync,
  constants,
  lstatSync,
  mkdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

function inside(root: string, path: string) {
  const part = relative(root, path);
  if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) {
    throw new Error(`Path outside storage directory: ${path} (root: ${root})`);
  }
}

/** Check each existing component before creating anything through a symlink. */
function controlledPath(root: string, input: string, create: boolean) {
  if (!input || input.includes('\0') || isAbsolute(input)) {
    throw new Error(`Invalid relative storage path: ${JSON.stringify(input)}`);
  }
  const actualRoot = realpathSync.native(root);
  let actual = actualRoot;
  for (const part of input.split(sep).filter(Boolean)) {
    // Keep .. until the preceding symlink has been resolved by the filesystem.
    actual = `${actual}${sep}${part}`;
    inside(actualRoot, actual);
    try {
      lstatSync(actual);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) throw error;
      mkdirSync(actual);
    }
    actual = realpathSync.native(actual);
    inside(actualRoot, actual);
  }
  return actual;
}

export function prepareLocalDirectory(storageRoot: string, input: string) {
  const path = controlledPath(storageRoot, input, true);
  if (!statSync(path).isDirectory())
    throw new Error(`Not a storage directory: ${path}`);
  accessSync(path, constants.W_OK | constants.X_OK);
  return path;
}

/** Generate before I/O; the owning upload/media operation persists BOTH keys. */
export function planLocalWrite(prefix: string) {
  const key = `${prefix}/${randomUUID()}`;
  return { key, temporaryKey: `${key}.partial` };
}

export type LocalStorage = { id: string; localPath: string; enabled: boolean };
export type LocalWrite = ReturnType<typeof planLocalWrite>;

function requireEnabled(storage: LocalStorage) {
  if (!storage.enabled)
    throw Object.assign(new Error(`Storage disabled: ${storage.id}`), {
      code: 'STORAGE_DISABLED',
      storageId: storage.id,
    });
}

function namespace(root: string, storage: LocalStorage, create: boolean) {
  const directory = controlledPath(root, storage.localPath, create);
  return controlledPath(directory, `ariso/${storage.id}`, create);
}

function objectPath(root: string, key: string, createParent = false) {
  // Object keys are internal relative paths, scoped to this configuration's namespace.
  if (!key || key.includes('\0') || isAbsolute(key))
    throw new Error(`Invalid object key: ${JSON.stringify(key)}`);
  const parent = controlledPath(root, dirname(key), createParent);
  const path = join(parent, basename(key));
  inside(root, path);
  if (path === root) throw new Error(`Object key names a directory: ${key}`);
  return path;
}

function operationError(
  cause: unknown,
  storage: LocalStorage,
  key: string,
  operation: string,
  path?: string,
  write?: LocalWrite,
) {
  return Object.assign(
    new Error(`Storage ${operation} failed: ${storage.id}, ${path ?? key}`, {
      cause,
    }),
    {
      code: 'STORAGE_OPERATION_FAILED',
      storageId: storage.id,
      key,
      operation,
      path,
      ...write,
    },
  );
}

/** Upload registers the key before obtaining a writable path. */
export function prepareLocalObjectPath(
  root: string,
  storage: LocalStorage,
  key: string,
) {
  requireEnabled(storage);
  return objectPath(namespace(root, storage, true), key, true);
}

/** Publish an already validated upload on the same filesystem without copying bytes. */
export async function publishLocalObject(
  root: string,
  storage: LocalStorage,
  temporaryKey: string,
  key: string,
) {
  const source = prepareLocalObjectPath(root, storage, temporaryKey);
  const target = prepareLocalObjectPath(root, storage, key);
  try {
    await rename(source, target);
  } catch (cause) {
    throw operationError(cause, storage, key, 'publish', target);
  }
}

/** The caller must durably register the plan before passing a stream. Never reuse a write plan. */
export async function writeObject(
  root: string,
  storage: LocalStorage,
  plan: LocalWrite,
  source: Readable,
  signal?: AbortSignal,
) {
  let temporaryPath: string | undefined;
  let targetPath: string | undefined;
  try {
    requireEnabled(storage);
    signal?.throwIfAborted();
    const directory = namespace(root, storage, true);
    temporaryPath = objectPath(directory, plan.temporaryKey, true);
    targetPath = objectPath(directory, plan.key, true);
    // Plans use fresh UUID keys. Reject accidental retries over an already published object.
    try {
      lstatSync(targetPath);
      throw Object.assign(new Error(`Object already exists: ${targetPath}`), {
        code: 'EEXIST',
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const output = createWriteStream(temporaryPath, { flags: 'wx' });
    await pipeline(source, output, { signal });
    signal?.throwIfAborted();
    await rename(temporaryPath, targetPath);
    // Once published, return the result even if a cancellation arrives now.
    return { key: plan.key, size: output.bytesWritten };
  } catch (cause) {
    // Also release the input when validation fails before pipeline owns it.
    source.destroy();
    // finished may repeat the original stream failure or report premature close after destroy.
    // Preserve the operation failure below rather than replace it during disposal.
    await finished(source, { cleanup: true }).catch(() => undefined);
    if ((cause as NodeJS.ErrnoException | null)?.code === 'STORAGE_DISABLED')
      throw cause;
    throw Object.assign(
      operationError(cause, storage, plan.key, 'write', temporaryPath, plan),
      { targetPath },
    );
  }
}

/** Maintenance inspection remains available on disabled configurations. */
export async function inspectObject(
  root: string,
  storage: LocalStorage,
  key: string,
) {
  let path: string | undefined;
  try {
    const directory = namespace(root, storage, false);
    path = objectPath(directory, key);
    const actual = controlledPath(directory, key, false);
    const info = await stat(actual);
    if (!info.isFile()) throw new Error(`Not a regular object: ${actual}`);
    return { size: info.size };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw operationError(cause, storage, key, 'inspect', path);
  }
}

/** MIME comes from media's verified metadata, never the filename. Consumer owns/ends the returned stream. */
export async function readObject(
  root: string,
  storage: LocalStorage,
  key: string,
  contentType: string,
  signal?: AbortSignal,
) {
  requireEnabled(storage);
  let path: string | undefined;
  try {
    const directory = namespace(root, storage, false);
    path = controlledPath(directory, key, false);
    const handle = await open(path, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error(`Not a regular object: ${path}`);
      const stream = handle.createReadStream({ autoClose: true, signal });
      return { stream, path, size: info.size, contentType };
    } catch (cause) {
      await handle.close();
      throw cause;
    }
  } catch (cause) {
    const error = operationError(cause, storage, key, 'read', path);
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
      error.code = 'STORAGE_OBJECT_MISSING';
    throw error;
  }
}

/** Delete exactly one owned key; absence is success, other failures retain the caller's responsibility. */
export async function deleteObject(
  root: string,
  storage: LocalStorage,
  key: string,
) {
  let path: string | undefined;
  try {
    const directory = namespace(root, storage, false);
    path = objectPath(directory, key);
    // Resolve the leaf too, so a key cannot point outside this namespace.
    controlledPath(directory, key, false);
    await unlink(path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw operationError(cause, storage, key, 'delete', path);
  }
}

/** Read-only maintenance enumeration. References and deletion belong to the composition caller. */
export async function* listObjects(
  root: string,
  storage: LocalStorage,
  options: { signal?: AbortSignal; batchSize?: number } = {},
): AsyncGenerator<{ key: string; size: number }[]> {
  const batchSize = options.batchSize ?? 1000;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error(
      'Object listing batchSize must be an integer from 1 to 1000',
    );
  let path: string | undefined;
  try {
    options.signal?.throwIfAborted();
    let directory: string;
    try {
      directory = namespace(root, storage, false);
    } catch (cause) {
      // An unused or already cleaned namespace has no objects; do not create it.
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw cause;
    }
    async function* walk(parent: string): AsyncGenerator<{
      key: string;
      size: number;
    }> {
      path = parent;
      options.signal?.throwIfAborted();
      const entries = await opendir(parent);
      // The async iterator closes its directory on completion, error and early return.
      for await (const entry of entries) {
        options.signal?.throwIfAborted();
        path = join(parent, entry.name);
        const info = await lstat(path);
        options.signal?.throwIfAborted();
        if (info.isDirectory()) yield* walk(path);
        else if (info.isFile())
          yield {
            key: relative(directory, path).split(sep).join('/'),
            size: info.size,
          };
        // Ariso writes regular files. Do not follow aliases into another object's tree.
      }
    }
    let batch: { key: string; size: number }[] = [];
    for await (const object of walk(directory)) {
      batch.push(object);
      if (batch.length === batchSize) {
        yield batch;
        options.signal?.throwIfAborted();
        batch = [];
      }
    }
    options.signal?.throwIfAborted();
    if (batch.length) yield batch;
  } catch (cause) {
    throw operationError(cause, storage, '', 'list', path);
  }
}
