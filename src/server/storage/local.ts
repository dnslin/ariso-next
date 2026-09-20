import { createWriteStream } from 'node:fs';
import { open, rename, stat, unlink } from 'node:fs/promises';
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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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
  const actualRoot = realpathSync(root);
  const candidate = resolve(actualRoot, input);
  inside(actualRoot, candidate);
  let actual = actualRoot;
  for (const part of relative(actualRoot, candidate)
    .split(sep)
    .filter(Boolean)) {
    actual = join(actual, part);
    try {
      lstatSync(actual);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) throw error;
      mkdirSync(actual);
    }
    actual = realpathSync(actual);
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
  const path = resolve(root, key);
  inside(root, path);
  if (path === root) throw new Error(`Object key names a directory: ${key}`);
  const parent = controlledPath(
    root,
    relative(root, dirname(path)) || '.',
    createParent,
  );
  return join(parent, relative(dirname(path), path));
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
    if ((cause as NodeJS.ErrnoException).code === 'STORAGE_DISABLED')
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
      return { stream, size: info.size, contentType };
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
