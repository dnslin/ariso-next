import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEncryptedArchive } from '../../../src/server/backup/archive.ts';
import { decryptArchiveFile } from '../../../src/server/backup/decrypt.ts';
import {
  extractArchiveEntries,
  inspectArchive,
  readArchiveEntry,
} from '../../../src/server/backup/read.ts';

let directory: string;
const password = '测试用口令 preserves whitespace ';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-backup-format-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function* fixtureEntries() {
  yield { name: 'manifest.json', source: Buffer.from('{"formatVersion":1}') };
  yield { name: 'secrets.json', source: Buffer.from('{"key":"fixture-only"}') };
  yield { name: 'database/ariso.db', source: Buffer.from('database fixture') };
  yield {
    name: 'objects/local/旅行/原图.bin',
    source: Readable.from([Buffer.alloc(131072, 0x29), Buffer.from('结尾')]),
    size: 131078,
  };
}

async function encryptedFixture() {
  const destination = join(directory, 'backup.zip.age');
  await createEncryptedArchive({
    destination,
    password,
    entries: fixtureEntries(),
  });
  return destination;
}

describe('backup ZIP64 and age format', () => {
  it('round trips streamed bytes and extracts only explicitly selected staging destinations', async () => {
    const source = join(directory, 'backup.zip.age');
    let copiedEntries = 0;
    let finalizing = false;
    await createEncryptedArchive({
      destination: source,
      password,
      entries: fixtureEntries(),
      onProgress: (progress) => {
        copiedEntries = progress.entries;
      },
      onFinalizing: () => {
        expect(copiedEntries).toBe(4);
        expect(existsSync(source)).toBe(false);
        finalizing = true;
      },
    });
    expect(finalizing).toBe(true);
    const destination = join(directory, 'content.zip');
    const decrypted = await decryptArchiveFile({
      source,
      destination,
      password,
    });
    expect(decrypted.zipBytes).toBe((await stat(destination)).size);
    const archive = await inspectArchive(destination);
    expect(archive.entries.map((entry) => entry.name)).toEqual([
      'manifest.json',
      'secrets.json',
      'database/ariso.db',
      'objects/local/旅行/原图.bin',
    ]);
    expect(archive.entries.at(-1)?.size).toBe(131078);
    expect(
      (
        await readArchiveEntry(destination, 'manifest.json', { maxBytes: 1024 })
      ).toString(),
    ).toBe('{"formatVersion":1}');
    const output = join(directory, 'ready', 'image.bin');
    expect(
      await extractArchiveEntries({
        source: destination,
        entries: [
          {
            name: 'objects/local/旅行/原图.bin',
            destination: output,
            size: 131078,
          },
        ],
      }),
    ).toEqual({ entries: 1, bytes: 131078 });
    expect(await readFile(output)).toEqual(
      Buffer.concat([Buffer.alloc(131072, 0x29), Buffer.from('结尾')]),
    );
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(existsSync(`${source}.part`)).toBe(false);
    expect(existsSync(`${destination}.part`)).toBe(false);
    expect(existsSync(join(directory, 'ready', 'manifest.json'))).toBe(false);
  });

  it('never publishes plaintext after a wrong password or a missing final authentication block', async () => {
    const source = await encryptedFixture();
    const bytes = await readFile(source);
    const truncated = join(directory, 'truncated.age');
    await writeFile(truncated, bytes.subarray(0, bytes.length - 1));
    for (const [input, secret] of [
      [source, 'wrong'],
      [truncated, password],
    ]) {
      const destination = join(directory, 'failed.zip');
      await expect(
        decryptArchiveFile({ source: input, destination, password: secret }),
      ).rejects.toThrow();
      expect(existsSync(destination)).toBe(false);
      expect(existsSync(`${destination}.part`)).toBe(false);
    }
  });

  it('does not publish an archive when a source fails', async () => {
    const destination = join(directory, 'failed.age');
    const source = Readable.from(
      (async function* () {
        yield Buffer.from('partial');
        throw new Error('source read failed');
      })(),
    );
    await expect(
      createEncryptedArchive({
        destination,
        password,
        entries: [{ name: 'objects/local/source.bin', source }],
      }),
    ).rejects.toThrow('source read failed');
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.part`)).toBe(false);
  });
});

describe('backup format failure boundaries', () => {
  it('rejects unsupported KDF work and oversized headers before creating plaintext', async () => {
    for (const header of [
      'age-encryption.org/v1\n-> scrypt aaaaaaaaaaaaaaaaaaaaaa 20\nbody\n--- mac\n',
      'age-encryption.org/v1\n' + 'x'.repeat(1100) + '\n--- mac\n',
    ]) {
      const source = join(directory, 'unsupported.age');
      const destination = join(directory, 'content.zip');
      await writeFile(source, header);
      await expect(
        decryptArchiveFile({ source, destination, password }),
      ).rejects.toThrow(/profile/);
      expect(existsSync(destination)).toBe(false);
      expect(existsSync(`${destination}.part`)).toBe(false);
    }
  });

  it('cancels an active source and removes its unfinished encrypted file', async () => {
    const controller = new AbortController();
    const source = new Readable({
      read() {
        this.push(Buffer.alloc(65536));
      },
    });
    const destination = join(directory, 'cancelled.age');
    await expect(
      createEncryptedArchive({
        destination,
        password,
        signal: controller.signal,
        entries: [{ name: 'objects/local/file.bin', source }],
        onProgress: ({ bytes }) => {
          if (bytes > 0) controller.abort(new Error('cancelled by owner'));
        },
      }),
    ).rejects.toThrow('cancelled by owner');
    expect(source.destroyed).toBe(true);
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.part`)).toBe(false);
  });

  it('rejects a source length different from the database and keeps existing partial files untouched', async () => {
    const destination = join(directory, 'wrong-size.age');
    await expect(
      createEncryptedArchive({
        destination,
        password,
        entries: [
          {
            name: 'objects/local/file.bin',
            source: Buffer.from('short'),
            size: 20,
          },
        ],
      }),
    ).rejects.toThrow('source size mismatch');
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.part`)).toBe(false);
    await writeFile(`${destination}.part`, 'existing partial');
    await expect(
      createEncryptedArchive({
        destination,
        password,
        entries: fixtureEntries(),
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(`${destination}.part`, 'utf8')).toBe(
      'existing partial',
    );
  });
});
