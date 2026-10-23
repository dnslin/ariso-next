import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractArchiveEntries,
  inspectArchive,
  readArchiveEntry,
} from '../../../src/server/backup/read.ts';
import {
  centralDirectoryOffset,
  replaceZipName,
  writeZipFixture,
} from './archive-fixture.ts';

let directory: string;
let source: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-backup-zip-'));
  source = join(directory, 'content.zip');
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('backup ZIP import boundary', () => {
  it('reports bytes while a large entry is still being staged', async () => {
    const size = 512 * 1024;
    await writeZipFixture(source, [
      { name: 'objects/local/large', value: Buffer.alloc(size) },
    ]);
    const destination = join(directory, 'large');
    const progress: Array<{ entries: number; bytes: number }> = [];
    await extractArchiveEntries({
      source,
      entries: [{ name: 'objects/local/large', destination, size }],
      onProgress: (value) => {
        progress.push(value);
      },
    });
    expect(
      progress.some(
        (value) => value.entries === 0 && value.bytes > 0 && value.bytes < size,
      ),
    ).toBe(true);
    expect(progress.at(-1)).toEqual({ entries: 1, bytes: size });
  });

  it('rejects duplicate names before returning metadata or a selected entry', async () => {
    await writeZipFixture(source, [
      { name: 'manifest.json' },
      { name: 'manifest.json' },
    ]);
    await expect(inspectArchive(source)).rejects.toThrow(
      'Duplicate archive entry',
    );
    await expect(
      readArchiveEntry(source, 'manifest.json', { maxBytes: 1024 }),
    ).rejects.toThrow('Duplicate archive entry');
  });

  it.each([false, true])(
    'rejects file/directory conflicts with reversed order %s',
    async (reverse) => {
      const entries = [
        { name: 'objects/local/one' },
        { name: 'objects/local/one/two' },
      ];
      await writeZipFixture(source, reverse ? entries.reverse() : entries);
      await expect(inspectArchive(source)).rejects.toThrow(
        'file/directory conflict',
      );
    },
  );

  it('rejects traversal names without creating files at any extraction target', async () => {
    const bytes = await writeZipFixture(source, [
      { name: 'objects/local/safe.bin' },
    ]);
    replaceZipName(bytes, 'objects/local/safe.bin', 'objects/local/../x.bin');
    await writeFile(source, bytes);
    const destination = join(directory, 'output');
    await expect(
      extractArchiveEntries({
        source,
        entries: [{ name: 'objects/local/../x.bin', destination }],
      }),
    ).rejects.toThrow();
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.part`)).toBe(false);
  });

  it.each(['symlink', 'deflate', 'encrypted'])(
    'rejects unsupported ZIP entry kind %s',
    async (kind) => {
      const bytes = await writeZipFixture(source, [
        {
          name: 'objects/local/file',
          data:
            kind === 'symlink'
              ? { type: 'symlink', linkname: '../../outside' }
              : kind === 'deflate'
                ? { store: false }
                : undefined,
        },
      ]);
      if (kind === 'encrypted') {
        const offset = centralDirectoryOffset(bytes);
        bytes.writeUInt16LE(bytes.readUInt16LE(offset + 8) | 1, offset + 8);
        // Traditional ZIP encryption declares its additional 12-byte header.
        bytes.writeUInt32LE(bytes.readUInt32LE(offset + 20) + 12, offset + 20);
        await writeFile(source, bytes);
      }
      await expect(inspectArchive(source)).rejects.toThrow(
        'Unsupported ZIP entry type',
      );
    },
  );

  it('checks CRC during reading and preserves an existing destination on corrupt content', async () => {
    const bytes = await writeZipFixture(source, [{ name: 'manifest.json' }]);
    const crcOffset = centralDirectoryOffset(bytes) + 16;
    bytes.writeUInt32LE((bytes.readUInt32LE(crcOffset) ^ 1) >>> 0, crcOffset);
    await writeFile(source, bytes);
    expect((await inspectArchive(source)).entries).toHaveLength(1);
    await expect(
      readArchiveEntry(source, 'manifest.json', { maxBytes: 1024 }),
    ).rejects.toThrow('checksum or size mismatch');
    const destination = join(directory, 'previous.json');
    await writeFile(destination, 'previous complete data');
    await expect(
      extractArchiveEntries({
        source,
        entries: [{ name: 'manifest.json', destination }],
      }),
    ).rejects.toThrow('checksum or size mismatch');
    expect(await readFile(destination, 'utf8')).toBe('previous complete data');
    expect(existsSync(`${destination}.part`)).toBe(false);
  });

  it('refuses missing entries, bounded metadata overflow, and database length mismatch', async () => {
    await writeZipFixture(source, [
      { name: 'manifest.json', value: Buffer.alloc(32) },
    ]);
    await expect(
      readArchiveEntry(source, 'secrets.json', { maxBytes: 1024 }),
    ).rejects.toThrow('Missing archive entry');
    await expect(
      readArchiveEntry(source, 'manifest.json', { maxBytes: 31 }),
    ).rejects.toThrow('metadata is too large');
    const destination = join(directory, 'unexpected');
    await expect(
      extractArchiveEntries({
        source,
        entries: [{ name: 'manifest.json', destination, size: 33 }],
      }),
    ).rejects.toThrow('database size');
    await expect(
      extractArchiveEntries({
        source,
        entries: [{ name: 'database/ariso.db', destination }],
      }),
    ).rejects.toThrow('Missing archive entry');
    expect(existsSync(destination)).toBe(false);
  });
});
