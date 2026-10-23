import { rm, stat } from 'node:fs/promises';
import { Readable, addAbortSignal } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { Encrypter } from 'age-encryption';
import ZipStream from 'zip-stream';
import {
  BACKUP_SCRYPT_LOG_N,
  BACKUP_STREAM_BUFFER,
  BackupFormatError,
  createArchiveNames,
  openPrivateOutput,
  publishArchiveFile,
  toByteWebStream,
  fromByteWebStream,
  type ArchiveProgress,
} from './format.ts';

export type ArchiveSource = {
  name: string;
  source: Readable | Uint8Array;
  size?: number;
};

/** Crypto runs in the backup worker; this function never buffers an entire file. */
export async function createEncryptedArchive(options: {
  destination: string;
  password: string;
  entries: AsyncIterable<ArchiveSource> | Iterable<ArchiveSource>;
  signal?: AbortSignal;
  onProgress?: (progress: ArchiveProgress) => void;
  onFinalizing?: () => void;
}) {
  const { signal } = options;
  signal?.throwIfAborted();
  if (!options.password.length)
    throw new BackupFormatError('Backup password must not be empty');
  const part = `${options.destination}.part`;
  const output = await openPrivateOutput(part);
  const zip = new ZipStream({ forceZip64: true, store: true });
  // The Node iterator and output pipeline report this same stream failure.
  zip.on('error', () => undefined);
  const bridge = Readable.from(zip, {
    objectMode: false,
    highWaterMark: BACKUP_STREAM_BUFFER,
  });
  if (signal) addAbortSignal(signal, bridge);
  let source: Readable | undefined;
  let sink: Promise<{ error?: unknown }> | undefined;
  const abort = () => {
    source?.destroy();
    zip.destroy();
  };
  signal?.addEventListener('abort', abort, { once: true });
  const registerName = createArchiveNames();
  let entries = 0;
  let bytes = 0;
  try {
    const encrypter = new Encrypter();
    encrypter.setPassphrase(options.password);
    encrypter.setScryptWorkFactor(BACKUP_SCRYPT_LOG_N);
    const encrypted = await encrypter.encrypt(toByteWebStream(bridge));
    sink = pipeline(fromByteWebStream(encrypted), output, { signal }).then(
      () => ({}),
      (error: unknown) => ({ error }),
    );
    for await (const item of options.entries) {
      signal?.throwIfAborted();
      registerName(item.name);
      source =
        item.source instanceof Readable
          ? item.source
          : Readable.from([item.source]);
      if (signal) addAbortSignal(signal, source);
      let itemBytes = 0;
      const counted = Readable.from(
        (async function* () {
          for await (const value of source!) {
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
            itemBytes += chunk.length;
            bytes += chunk.length;
            options.onProgress?.({ entries, bytes });
            yield chunk;
          }
        })(),
        { objectMode: false, highWaterMark: BACKUP_STREAM_BUFFER },
      );
      await new Promise<void>((resolve, reject) => {
        const done = (error?: unknown) => {
          zip.removeListener('error', done);
          signal?.removeEventListener('abort', cancelled);
          if (error) reject(error);
          else resolve();
        };
        const cancelled = () => done(signal?.reason);
        signal?.addEventListener('abort', cancelled, { once: true });
        zip.once('error', done);
        zip.entry(
          counted,
          { name: item.name, type: 'file', mode: 0o600, store: true },
          done,
        );
        if (signal?.aborted) cancelled();
      });
      if (item.size !== undefined && itemBytes !== item.size)
        throw new BackupFormatError(
          `Archive source size mismatch: ${item.name}`,
        );
      source = undefined;
      entries++;
      options.onProgress?.({ entries, bytes });
    }
    signal?.throwIfAborted();
    options.onFinalizing?.();
    zip.finalize();
    const result = await sink;
    if (result.error) throw result.error;
    await publishArchiveFile(part, options.destination, signal);
    return {
      entries,
      bytes,
      archiveBytes: (await stat(options.destination)).size,
    };
  } catch (error) {
    source?.destroy();
    zip.destroy();
    bridge.destroy();
    output.destroy();
    await sink;
    await finished(output).catch(() => undefined);
    await rm(part, { force: true });
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
