// Narrow experimental control only: this writer is not installed as a product dependency.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { Encrypter } from 'age-encryption';
import { PASSWORD } from './archive.mjs';

export async function writeYazlControl(job, progress) {
  assert.equal(job.scope, 'many');
  assert.equal(job.entries, 100000);
  const loadedModule = await import(pathToFileURL(job.yazlModule).href);
  const { ZipFile } = loadedModule.default;
  const zip = new ZipFile();
  zip.on('error', (error) => zip.outputStream.destroy(error));
  const part = `${job.target}.part`;
  const encrypter = new Encrypter();
  encrypter.setPassphrase(PASSWORD);
  encrypter.setScryptWorkFactor(18);
  progress({ stage: 'kdf-start' });
  const encrypted = await encrypter.encrypt(
    Readable.toWeb(zip.outputStream, {
      strategy: { highWaterMark: 65536, size: (chunk) => chunk.byteLength },
    }),
  );
  progress({ stage: 'kdf-complete' });
  const sink = pipeline(
    Readable.fromWeb(encrypted),
    createWriteStream(part, { flags: 'wx', mode: 0o600 }),
  ).then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error }),
  );
  const manifest = Buffer.from(
    JSON.stringify({ formatVersion: 1, fixture: 'many' }),
  );
  const expected = {
    'manifest.json': {
      bytes: manifest.length,
      sha256: createHash('sha256').update(manifest).digest('hex'),
    },
  };
  let inputBytes = 0;
  let openedSources = 0;
  let activeSources = 0;
  let maxActiveSources = 0;
  const add = (name, bytes, last = false) => {
    inputBytes += bytes.length;
    zip.addReadStreamLazy(
      name,
      {
        compress: false,
        mtime: new Date('2026-10-22T00:00:00Z'),
        mode: 0o100600,
      },
      (callback) => {
        openedSources++;
        activeSources++;
        maxActiveSources = Math.max(maxActiveSources, activeSources);
        const source = Readable.from([bytes], {
          objectMode: false,
          highWaterMark: 65536,
        });
        source.once('end', () => {
          activeSources--;
          if (last)
            progress({
              stage: 'last-source-ended',
              memory: process.memoryUsage(),
            });
        });
        callback(null, source);
      },
    );
  };
  try {
    add('manifest.json', manifest);
    for (let i = 0; i < job.entries; i++)
      add(
        `objects/local/照片-${String(i).padStart(6, '0')}.bin`,
        Buffer.from(`entry ${i} — 中文文件\n`),
        i === job.entries - 1,
      );
    progress({
      stage: 'before-end-after-queue',
      memory: process.memoryUsage(),
    });
    zip.end({ forceZip64Format: true });
    const result = await sink;
    if (!result.ok) throw result.error;
    assert.equal(openedSources, 100001);
    assert.equal(maxActiveSources, 1);
    const output = await open(part, 'r');
    try {
      await output.sync();
    } finally {
      await output.close();
    }
    await rename(part, job.target);
    const parent = await open(dirname(job.target), 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    progress({ stage: 'output-completed', memory: process.memoryUsage() });
    return {
      count: openedSources,
      inputBytes,
      expected,
      archiveBytes: (await stat(job.target)).size,
      maxActiveSources,
      comparisonWriter: 'yazl@3.3.1',
    };
  } catch (error) {
    zip.outputStream.destroy(error);
    await sink;
    await rm(part, { force: true });
    throw error;
  }
}
