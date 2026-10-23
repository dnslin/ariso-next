import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { addAbortSignal, Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import {
  BackupFormatError,
  BACKUP_STREAM_BUFFER,
  createArchiveNames,
  openPrivateOutput,
  publishArchiveFile,
  type ArchiveEntryInfo,
  type ArchiveProgress,
} from './format.ts';

function openArchive(source: string) {
  return yauzl.openPromise(source, {
    lazyEntries: true,
    autoClose: false,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
}

function entryInfo(entry: Entry): ArchiveEntryInfo {
  const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (
    entry.compressionMethod !== 0 ||
    entry.isEncrypted() ||
    (entry.externalFileAttributes & 0x10) !== 0 ||
    (unixType !== 0 && unixType !== 0o100000)
  )
    throw new BackupFormatError(
      `Unsupported ZIP entry type: ${entry.fileName}`,
    );
  if (
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.uncompressedSize < 0
  )
    throw new BackupFormatError(
      `Unsupported ZIP entry size: ${entry.fileName}`,
    );
  return {
    name: entry.fileName,
    size: entry.uncompressedSize,
    crc32: entry.crc32,
  };
}

/** Central-directory validation only; object contents are verified when read. */
export async function inspectArchive(
  source: string,
  options: { signal?: AbortSignal } = {},
) {
  options.signal?.throwIfAborted();
  const zip = await openArchive(source);
  const registerName = createArchiveNames();
  const entries: ArchiveEntryInfo[] = [];
  let bytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      options.signal?.throwIfAborted();
      registerName(entry.fileName);
      const info = entryInfo(entry);
      bytes += info.size;
      if (!Number.isSafeInteger(bytes))
        throw new BackupFormatError('Archive is too large');
      entries.push(info);
    }
    return { entries, bytes };
  } finally {
    zip.close();
  }
}

async function* verifiedChunks(
  zip: ZipFile,
  entry: Entry,
  signal?: AbortSignal,
  onBytes?: (bytes: number) => void,
) {
  signal?.throwIfAborted();
  const stream = await zip.openReadStreamPromise(entry);
  if (signal) addAbortSignal(signal, stream);
  let length = 0;
  let crc = 0;
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      length += chunk.length;
      if (length > entry.uncompressedSize)
        throw new BackupFormatError(
          `Archive entry exceeds declared size: ${entry.fileName}`,
        );
      crc = crc32(chunk, crc);
      onBytes?.(chunk.length);
      yield chunk as Buffer;
    }
    if (length !== entry.uncompressedSize || crc !== entry.crc32)
      throw new BackupFormatError(
        `Archive entry checksum or size mismatch: ${entry.fileName}`,
      );
  } finally {
    stream.destroy();
  }
}

/** Read small metadata only. Large entries use extractArchiveEntries. */
export async function readArchiveEntry(
  source: string,
  name: string,
  options: { maxBytes: number; signal?: AbortSignal },
) {
  options.signal?.throwIfAborted();
  const zip = await openArchive(source);
  const registerName = createArchiveNames();
  let selected: Entry | undefined;
  try {
    for await (const entry of zip.eachEntry()) {
      options.signal?.throwIfAborted();
      registerName(entry.fileName);
      entryInfo(entry);
      if (entry.fileName === name) selected = entry;
    }
    if (!selected)
      throw new BackupFormatError(`Missing archive entry: ${name}`);
    if (selected.uncompressedSize > options.maxBytes)
      throw new BackupFormatError(`Archive metadata is too large: ${name}`);
    const chunks: Buffer[] = [];
    for await (const chunk of verifiedChunks(zip, selected, options.signal))
      chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    zip.close();
  }
}

export type ArchiveExtraction = {
  name: string;
  size?: number;
} & (
  | { destination: string }
  | { write: (stream: Readable, entry: ArchiveEntryInfo) => Promise<void> }
);

/** Destinations come from the validated database mapping, never ZIP path concatenation. */
export async function extractArchiveEntries(options: {
  source: string;
  entries: Iterable<ArchiveExtraction>;
  signal?: AbortSignal;
  onProgress?: (progress: ArchiveProgress) => void;
}) {
  const { signal } = options;
  signal?.throwIfAborted();
  const targets = new Map<string, ArchiveExtraction>();
  for (const item of options.entries) {
    if (targets.has(item.name))
      throw new BackupFormatError(`Duplicate extraction target: ${item.name}`);
    targets.set(item.name, item);
  }
  const zip = await openArchive(options.source);
  const registerName = createArchiveNames();
  let entries = 0;
  let bytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      signal?.throwIfAborted();
      registerName(entry.fileName);
      const info = entryInfo(entry);
      const target = targets.get(entry.fileName);
      if (!target) continue;
      if (target.size !== undefined && info.size !== target.size)
        throw new BackupFormatError(
          `Archive entry differs from database size: ${info.name}`,
        );
      if ('write' in target) {
        let verified = false;
        const input = Readable.from(
          (async function* () {
            yield* verifiedChunks(zip, entry, signal, (count) => {
              bytes += count;
              options.onProgress?.({ entries, bytes });
            });
            verified = true;
          })(),
          { objectMode: false, highWaterMark: BACKUP_STREAM_BUFFER },
        );
        const consumed = finished(input, { cleanup: true });
        // The sink may fail first; retain that failure while still disposing the reader.
        void consumed.catch(() => undefined);
        try {
          await target.write(input, info);
          if (!verified)
            throw new BackupFormatError(
              `Archive entry was not fully verified: ${info.name}`,
            );
          await consumed;
        } finally {
          input.destroy();
          await consumed.catch(() => undefined);
        }
      } else {
        await mkdir(dirname(target.destination), {
          recursive: true,
          mode: 0o700,
        });
        const part = `${target.destination}.part`;
        const output = await openPrivateOutput(part);
        try {
          await pipeline(
            Readable.from(
              verifiedChunks(zip, entry, signal, (count) => {
                bytes += count;
                options.onProgress?.({ entries, bytes });
              }),
              { objectMode: false, highWaterMark: BACKUP_STREAM_BUFFER },
            ),
            output,
            { signal },
          );
          await publishArchiveFile(part, target.destination, signal);
        } catch (error) {
          output.destroy();
          await finished(output).catch(() => undefined);
          await rm(part, { force: true });
          throw error;
        }
      }
      targets.delete(info.name);
      entries++;
      options.onProgress?.({ entries, bytes });
    }
    if (targets.size)
      throw new BackupFormatError(
        `Missing archive entry: ${targets.keys().next().value}`,
      );
    return { entries, bytes };
  } finally {
    zip.close();
  }
}
