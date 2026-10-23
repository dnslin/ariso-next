import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import { Encrypter, Decrypter } from 'age-encryption';
import ZipStream from 'zip-stream';
import yauzl from 'yauzl';

export const MiB = 1024 * 1024;
export const PASSWORD = 'Ariso isolated experiment — 无真实秘密 2026';

function toByteWebStream(readable) {
  return Readable.toWeb(readable, {
    strategy: { highWaterMark: 65536, size: (chunk) => chunk.byteLength },
  });
}

export async function checkAgeProfile(path) {
  const file = await open(path, 'r');
  try {
    const prefix = Buffer.alloc(1025);
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0);
    const bytes = prefix.subarray(0, bytesRead);
    const mac = bytes.indexOf('\n--- ');
    const end = mac < 0 ? -1 : bytes.indexOf('\n', mac + 1);
    if (end < 0 || end >= 1024) throw new Error('AGE_HEADER_TOO_LONG');
    const lines = bytes.subarray(0, end).toString('ascii').split('\n');
    assert.equal(lines[0], 'age-encryption.org/v1', 'unsupported age version');
    const stanzas = lines.filter((line) => line.startsWith('-> '));
    assert.equal(stanzas.length, 1, 'expected exactly one scrypt stanza');
    const [marker, type, salt, factor, ...extra] = stanzas[0].split(' ');
    assert.equal(marker, '->');
    assert.equal(type, 'scrypt', 'unsupported recipient');
    assert.equal(extra.length, 0, 'unsupported stanza fields');
    assert.match(salt, /^[A-Za-z0-9+/]{22}$/);
    if (factor !== '18') throw new Error('UNSUPPORTED_SCRYPT_WORK_FACTOR');
    return { headerBytes: end + 1, logN: 18 };
  } finally {
    await file.close();
  }
}

async function syncAndPublish(part, target) {
  const handle = await open(part, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(part, target);
  const parent = await open(dirname(target), 'r');
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

async function append(zip, source, name) {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      zip.removeListener('error', onError);
      reject(error);
    };
    zip.once('error', onError);
    zip.entry(
      source,
      {
        name,
        store: true,
        date: new Date('2026-10-22T00:00:00Z'),
        mode: 0o600,
      },
      (error) => {
        zip.removeListener('error', onError);
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

export async function writeEncryptedArchive(
  target,
  sources,
  progress = () => {},
) {
  const part = `${target}.part`;
  const zip = new ZipStream({ forceZip64: true, store: true });
  // A rejected entry still needs a stream error listener while cleanup settles.
  zip.on('error', () => {});
  const encrypter = new Encrypter();
  encrypter.setPassphrase(PASSWORD);
  encrypter.setScryptWorkFactor(18);
  progress({ stage: 'kdf-start' });
  const encrypted = await encrypter.encrypt(
    toByteWebStream(
      Readable.from(zip, { objectMode: false, highWaterMark: 65536 }),
    ),
  );
  progress({ stage: 'kdf-complete' });
  const sink = pipeline(
    Readable.fromWeb(encrypted),
    createWriteStream(part, { flags: 'wx', mode: 0o600 }),
  ).then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error }),
  );
  let count = 0;
  let inputBytes = 0;
  const expected = {};
  try {
    for await (const item of sources) {
      const hash = item.keepHash ? createHash('sha256') : undefined;
      let bytes = 0;
      const source = Readable.from(
        (async function* () {
          for await (const chunk of item.source) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            inputBytes += buffer.length;
            if (item.keepHash) hash.update(buffer);
            if (inputBytes % (8 * MiB) < buffer.length)
              progress({ stage: 'copying', inputBytes });
            yield buffer;
          }
        })(),
        { objectMode: false, highWaterMark: 65536 },
      );
      await append(zip, source, item.name);
      if (item.keepHash)
        expected[item.name] = { bytes, sha256: hash.digest('hex') };
      count++;
      if (count % 1000 === 0) progress({ stage: 'entries', count });
    }
    progress({
      stage: 'before-finalize',
      count,
      memory: process.memoryUsage(),
    });
    zip.finalize();
    progress({ stage: 'after-finalize', count, memory: process.memoryUsage() });
    const result = await sink;
    if (!result.ok) throw result.error;
    await syncAndPublish(part, target);
    return {
      count,
      inputBytes,
      archiveBytes: (await stat(target)).size,
      expected,
    };
  } catch (error) {
    zip.destroy(error);
    await sink;
    await rm(part, { force: true });
    throw error;
  }
}

export async function encryptFile(source, target, progress = () => {}) {
  const part = `${target}.part`;
  const encrypter = new Encrypter();
  encrypter.setPassphrase(PASSWORD);
  encrypter.setScryptWorkFactor(18);
  progress({ stage: 'kdf-start' });
  try {
    const encrypted = await encrypter.encrypt(
      toByteWebStream(createReadStream(source)),
    );
    progress({ stage: 'kdf-complete' });
    await pipeline(
      Readable.fromWeb(encrypted),
      createWriteStream(part, { flags: 'wx', mode: 0o600 }),
    );
    await syncAndPublish(part, target);
    return { archiveBytes: (await stat(target)).size };
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

export async function decryptFile(
  source,
  target,
  password = PASSWORD,
  progress = () => {},
) {
  const profile = await checkAgeProfile(source);
  const part = `${target}.part`;
  const decrypter = new Decrypter();
  decrypter.addPassphrase(password);
  progress({ stage: 'kdf-start' });
  try {
    const decrypted = await decrypter.decrypt(
      toByteWebStream(createReadStream(source, { highWaterMark: 65536 })),
    );
    progress({ stage: 'kdf-complete' });
    await pipeline(
      Readable.fromWeb(decrypted),
      createWriteStream(part, { flags: 'wx', mode: 0o600 }),
    );
    await syncAndPublish(part, target);
    return { profile, zipBytes: (await stat(target)).size };
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

export async function validateZip(path, expected = {}, progress = () => {}) {
  const zip = await yauzl.openPromise(path, {
    lazyEntries: true,
    autoClose: false,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  const seen = new Set();
  const hashes = {};
  let count = 0;
  let bytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      assert(!seen.has(entry.fileName), `DUPLICATE_ENTRY: ${entry.fileName}`);
      seen.add(entry.fileName);
      assert.match(
        entry.fileName,
        /^(manifest\.json|secrets\.json|database\/ariso\.db|assets\/(branding|watermarks)\/.+|objects\/[^/]+\/.+)$/,
        'UNSUPPORTED_ARCHIVE_PATH',
      );
      assert(!entry.fileName.split('/').includes('..'), 'PATH_ESCAPE');
      assert.equal(entry.compressionMethod, 0, 'UNSUPPORTED_COMPRESSION');
      assert.equal(entry.generalPurposeBitFlag & 1, 0, 'ZIP_ENTRY_ENCRYPTED');
      const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
      assert(unixType === 0 || unixType === 0o100000, 'UNSUPPORTED_FILE_TYPE');
      const stream = await zip.openReadStreamPromise(entry);
      let length = 0;
      let crc = 0;
      const hash = expected[entry.fileName] ? createHash('sha256') : undefined;
      const smallParts = [];
      const many = /^objects\/local\/照片-\d{6}\.bin$/.test(entry.fileName);
      for await (const chunk of stream) {
        length += chunk.length;
        bytes += chunk.length;
        crc = crc32(chunk, crc);
        if (expected[entry.fileName]) hash.update(chunk);
        if (many) smallParts.push(chunk);
      }
      assert.equal(
        length,
        entry.uncompressedSize,
        `SIZE_MISMATCH: ${entry.fileName}`,
      );
      assert.equal(crc, entry.crc32, `CRC_MISMATCH: ${entry.fileName}`);
      if (expected[entry.fileName]) {
        const sha256 = hash.digest('hex');
        assert.equal(length, expected[entry.fileName].bytes);
        assert.equal(
          sha256,
          expected[entry.fileName].sha256,
          `BYTE_MISMATCH: ${entry.fileName}`,
        );
        hashes[entry.fileName] = sha256;
      }
      if (many) {
        const index = Number(entry.fileName.match(/(\d{6})\.bin$/)[1]);
        assert.equal(
          Buffer.concat(smallParts).toString(),
          `entry ${index} — 中文文件\n`,
        );
      }
      count++;
      if (count % 1000 === 0) progress({ stage: 'verified-entries', count });
    }
    for (const name of Object.keys(expected))
      assert(seen.has(name), `MISSING_ENTRY: ${name}`);
    return { count, bytes, hashes };
  } finally {
    zip.close();
  }
}
