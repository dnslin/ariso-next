import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_SCRYPT_LOG_N = 18;
export const BACKUP_STREAM_BUFFER = 64 * 1024;

export type ArchiveEntryInfo = { name: string; size: number; crc32: number };
export type ArchiveProgress = { entries: number; bytes: number };

export class BackupFormatError extends Error {
  readonly code = 'BACKUP_INVALID_ARCHIVE';
}

export function checkArchiveName(name: string) {
  const parts = name.split('/');
  if (
    name.includes('\\') ||
    name.includes('\0') ||
    parts.some((part) => !part || part === '.' || part === '..') ||
    !/^(manifest\.json|secrets\.json|database\/ariso\.db|assets\/(branding|watermarks)\/.+|objects\/[^/]+\/.+)$/.test(
      name,
    )
  )
    throw new BackupFormatError(`Unsupported archive entry: ${name}`);
}

export function createArchiveNames() {
  const files = new Set<string>();
  const directories = new Set<string>();
  return (name: string) => {
    checkArchiveName(name);
    if (files.has(name))
      throw new BackupFormatError(`Duplicate archive entry: ${name}`);
    if (directories.has(name))
      throw new BackupFormatError(`Archive file/directory conflict: ${name}`);
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      if (files.has(parent))
        throw new BackupFormatError(`Archive file/directory conflict: ${name}`);
      directories.add(parent);
    }
    files.add(name);
  };
}

export function toByteWebStream(source: Readable) {
  return Readable.toWeb(source, {
    strategy: {
      highWaterMark: BACKUP_STREAM_BUFFER,
      size: (chunk: Uint8Array) => chunk.byteLength,
    },
  }) as ReadableStream<Uint8Array>;
}

export function fromByteWebStream(source: ReadableStream<Uint8Array>) {
  // Node and DOM describe BYOB buffers differently; these are the same native stream.
  return Readable.fromWeb(source as NodeReadableStream<Uint8Array>);
}

export async function openPrivateOutput(path: string) {
  const output = createWriteStream(path, { flags: 'wx', mode: 0o600 });
  await once(output, 'open');
  return output;
}

export async function publishArchiveFile(
  part: string,
  destination: string,
  signal?: AbortSignal,
) {
  const handle = await open(part, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  signal?.throwIfAborted();
  await rename(part, destination);
  const parent = await open(dirname(destination), 'r');
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}
