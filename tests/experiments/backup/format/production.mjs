import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { cpus, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { createEncryptedArchive } from '../../../../src/server/backup/archive.ts';
import { decryptArchiveFile } from '../../../../src/server/backup/decrypt.ts';
import {
  inspectArchive,
  readArchiveEntry,
  extractArchiveEntries,
} from '../../../../src/server/backup/read.ts';

const here = dirname(fileURLToPath(import.meta.url));
const password = 'Ariso formal format fixture — 非真实秘密';
const phase = process.argv.find((arg) => arg.startsWith('--child='))?.slice(8);
const started = performance.now();
const environment = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: cpus()[0].model,
  cpus: cpus().length,
  memoryBytes: totalmem(),
};

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

if (phase) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-formal-format-'));
  const archive = join(directory, 'source.zip.age');
  const zip = join(directory, 'content.zip');
  let details;
  try {
    if (phase === 'large') {
      const size = 4 * 1024 ** 3 + 1024 ** 2;
      const disk = await statfs(directory);
      assert(
        disk.bavail * disk.bsize > 14 * 1024 ** 3,
        'Need 14 GiB free for the actual large-file test',
      );
      const hash = createHash('sha256');
      const chunk = Buffer.alloc(1024 ** 2);
      for (let i = 0; i < chunk.length; i++) chunk[i] = i % 251;
      const source = Readable.from(
        (async function* () {
          for (let offset = 0; offset < size; offset += chunk.length) {
            const bytes = chunk.subarray(
              0,
              Math.min(chunk.length, size - offset),
            );
            hash.update(bytes);
            yield bytes;
          }
        })(),
      );
      const result = await createEncryptedArchive({
        destination: archive,
        password,
        entries: [
          { name: 'manifest.json', source: Buffer.from('{"formatVersion":1}') },
          { name: 'objects/local/large.bin', source, size },
        ],
      });
      assert(result.archiveBytes > 2 ** 32);
      const expected = hash.digest('hex');
      await decryptArchiveFile({ source: archive, destination: zip, password });
      const inspected = await inspectArchive(zip);
      assert.equal(inspected.entries[1].size, size);
      const destination = join(directory, 'ready', 'large.bin');
      const extracted = await extractArchiveEntries({
        source: zip,
        entries: [{ name: 'objects/local/large.bin', destination, size }],
      });
      assert.equal(extracted.bytes, size);
      assert.equal(await digest(destination), expected);
      details = {
        bytes: size,
        sha256: expected,
        encryptedBytes: result.archiveBytes,
        extracted,
      };
    } else if (phase === 'many') {
      const count = 100000;
      const name = (i) =>
        `objects/local/照片-${String(i).padStart(6, '0')}.bin`;
      const value = (i) => Buffer.from(`entry ${i} — 中文文件\n`);
      async function* entries() {
        for (let i = 0; i < count; i++)
          yield { name: name(i), source: value(i), size: value(i).length };
      }
      await createEncryptedArchive({
        destination: archive,
        password,
        entries: entries(),
      });
      await decryptArchiveFile({ source: archive, destination: zip, password });
      assert.equal((await inspectArchive(zip)).entries.length, count);
      function* targets() {
        for (let i = 0; i < count; i++)
          yield {
            name: name(i),
            destination: join(directory, 'ready', `${i}.bin`),
            size: value(i).length,
          };
      }
      const extracted = await extractArchiveEntries({
        source: zip,
        entries: targets(),
      });
      assert.equal(extracted.entries, count);
      for (let i = 0; i < count; i++)
        assert.deepEqual(
          await readFile(join(directory, 'ready', `${i}.bin`)),
          value(i),
        );
      details = { objects: count, allExtractedBytesCompared: true, extracted };
    } else if (phase === 'interop') {
      const binary =
        process.env.AGE_BINARY ??
        resolve('.data/backup-experiment-tools/bin/age');
      assert(existsSync(binary), `Official age CLI is required: ${binary}`);
      const cli = (mode, source, target) => {
        const result = spawnSync(
          '/usr/bin/python3',
          [join(here, 'age-cli.py')],
          {
            input: JSON.stringify({ binary, mode, source, target, password }),
            encoding: 'utf8',
            timeout: 65000,
          },
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        return JSON.parse(result.stdout);
      };
      const payload = Buffer.from('正式代码互通\0\xff');
      await createEncryptedArchive({
        destination: archive,
        password,
        entries: [{ name: 'objects/local/中文.bin', source: payload }],
      });
      const fromJs = cli('decrypt', archive, zip);
      assert.deepEqual(
        await readArchiveEntry(zip, 'objects/local/中文.bin', {
          maxBytes: 1024,
        }),
        payload,
      );
      const cliCipher = join(directory, 'cli.age');
      const fromCli = cli('encrypt', zip, cliCipher);
      const decoded = join(directory, 'decoded.zip');
      await decryptArchiveFile({
        source: cliCipher,
        destination: decoded,
        password,
      });
      assert.deepEqual(
        await readArchiveEntry(decoded, 'objects/local/中文.bin', {
          maxBytes: 1024,
        }),
        payload,
      );
      details = {
        officialVersion: spawnSync(binary, ['--version'], {
          encoding: 'utf8',
        }).stdout.trim(),
        fromJs,
        fromCli,
      };
    } else throw new Error(`Unknown phase ${phase}`);
    console.log(
      JSON.stringify({
        phase,
        status: 'passed',
        ...details,
        elapsedMs: performance.now() - started,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        environment,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
} else {
  const results = [];
  for (const phase of ['interop', 'large', 'many']) {
    results.push(
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(import.meta.url), `--child=${phase}`],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        let error = '';
        child.stdout.on('data', (bytes) => {
          output += bytes;
        });
        child.stderr.on('data', (bytes) => {
          error += bytes;
        });
        child.once('error', reject);
        child.once('exit', (code) => {
          if (code !== 0)
            reject(new Error(`${phase} failed (${code}): ${error}\n${output}`));
          else resolve(JSON.parse(output));
        });
      }),
    );
    console.log(`Passed ${phase}`);
  }
  await writeFile(
    join(here, 'report-production.json'),
    JSON.stringify(
      {
        scope:
          'Formal format functions; isolated Node processes, not complete product runtime',
        results,
        temporaryResourcesRemoved: true,
      },
      null,
      2,
    ) + '\n',
  );
}
