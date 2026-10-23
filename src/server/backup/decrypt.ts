import { createReadStream } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { finished, pipeline } from 'node:stream/promises';
import { Decrypter } from 'age-encryption';
import {
  BACKUP_STREAM_BUFFER,
  BackupFormatError,
  openPrivateOutput,
  publishArchiveFile,
  toByteWebStream,
  fromByteWebStream,
} from './format.ts';

/** Restrict attacker-controlled KDF cost before invoking age's authenticated parser. */
export async function checkAgeProfile(path: string) {
  const file = await open(path, 'r');
  try {
    const prefix = Buffer.alloc(1024);
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0);
    const header = prefix.subarray(0, bytesRead);
    const mac = header.indexOf('\n--- ');
    const end = mac < 0 ? -1 : header.indexOf('\n', mac + 1);
    if (end < 0)
      throw new BackupFormatError(
        'Backup age header exceeds the supported profile',
      );
    const lines = header.subarray(0, end).toString('utf8').split('\n');
    const stanzas = lines.filter((line) => line.startsWith('-> '));
    if (
      lines[0] !== 'age-encryption.org/v1' ||
      stanzas.length !== 1 ||
      !/^-> scrypt [A-Za-z0-9+/]{22} 18$/.test(stanzas[0])
    )
      throw new BackupFormatError('Unsupported backup encryption profile');
  } finally {
    await file.close();
  }
}

/** The staged ZIP is published only after age authenticates its final block. */
export async function decryptArchiveFile(options: {
  source: string;
  destination: string;
  password: string;
  signal?: AbortSignal;
}) {
  const { source, destination, password, signal } = options;
  signal?.throwIfAborted();
  if (!password.length)
    throw new BackupFormatError('Backup password must not be empty');
  await checkAgeProfile(source);
  const part = `${destination}.part`;
  const output = await openPrivateOutput(part);
  const input = createReadStream(source, {
    highWaterMark: BACKUP_STREAM_BUFFER,
    signal,
  });
  try {
    const decrypter = new Decrypter();
    decrypter.addPassphrase(password);
    const plaintext = await decrypter.decrypt(toByteWebStream(input));
    await pipeline(fromByteWebStream(plaintext), output, { signal });
    await publishArchiveFile(part, destination, signal);
    return { zipBytes: (await stat(destination)).size };
  } catch (error) {
    input.destroy();
    output.destroy();
    await finished(output).catch(() => undefined);
    await rm(part, { force: true });
    signal?.throwIfAborted();
    throw error;
  }
}
