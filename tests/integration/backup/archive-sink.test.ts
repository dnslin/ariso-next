import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import ZipStream from 'zip-stream';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { extractArchiveEntries } from '../../../src/server/backup/read.ts';

let directory: string;
const name = 'objects/remote/旅行.png';
const payload = Buffer.from('remote bytes with a verified archive checksum');
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-backup-sink-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const zip = new ZipStream({ store: true, forceZip64: true });
  const bytes: Buffer[] = [];
  const reading = (async () => {
    for await (const chunk of zip) bytes.push(Buffer.from(chunk));
  })();
  await new Promise<void>((resolve, reject) =>
    zip.entry(payload, { name }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  await zip.finalize();
  await reading;
  const source = join(directory, 'content.zip');
  await writeFile(source, Buffer.concat(bytes));
  return source;
}
it('streams a selected entry to a remote sink and reports its verified bytes', async () => {
  const source = await fixture();
  const chunks: Buffer[] = [];
  const result = await extractArchiveEntries({
    source,
    entries: [
      {
        name,
        size: payload.length,
        write: async (stream: Readable) => {
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        },
      },
    ],
  });
  expect(Buffer.concat(chunks)).toEqual(payload);
  expect(result).toEqual({ entries: 1, bytes: payload.length });
});
it('does not accept a successful sink response as archive checksum verification', async () => {
  const source = await fixture();
  const data = await readFile(source);
  const offset = data.indexOf(payload);
  expect(offset).toBeGreaterThan(0);
  data[offset] ^= 1;
  await writeFile(source, data);
  await expect(
    extractArchiveEntries({
      source,
      entries: [
        {
          name,
          write: async (stream: Readable) => {
            for await (const _chunk of stream) {
              void _chunk;
            }
          },
        },
      ],
    }),
  ).rejects.toThrow(/checksum/);
});
it('rejects a sink which returns without consuming the entry instead of hanging or completing it', async () => {
  const source = await fixture();
  await expect(
    extractArchiveEntries({
      source,
      entries: [{ name, write: async () => {} }],
    }),
  ).rejects.toThrow(/fully verified/);
});
it('retains the remote write failure and closes its source', async () => {
  const source = await fixture();
  let stream: Readable | undefined;
  await expect(
    extractArchiveEntries({
      source,
      entries: [
        {
          name,
          write: async (input: Readable) => {
            stream = input;
            throw new Error('fixture remote denied');
          },
        },
      ],
    }),
  ).rejects.toThrow('fixture remote denied');
  expect(stream?.destroyed).toBe(true);
});
