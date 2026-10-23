import { createReadStream } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import {
  decryptFile,
  encryptFile,
  MiB,
  validateZip,
  writeEncryptedArchive,
} from './archive.mjs';

function progress(event) {
  parentPort.postMessage({ type: 'progress', ...event });
}

async function* sources(job) {
  yield {
    name: 'manifest.json',
    source: [
      Buffer.from(JSON.stringify({ formatVersion: 1, fixture: job.scope })),
    ],
    keepHash: true,
  };
  if (job.scope === 'many') {
    for (let i = 0; i < job.entries; i++)
      yield {
        name: `objects/local/照片-${String(i).padStart(6, '0')}.bin`,
        source: [Buffer.from(`entry ${i} — 中文文件\n`)],
      };
    return;
  }
  if (
    job.scope === 'large' ||
    job.scope === 'cancel' ||
    job.scope === 'source-failure'
  ) {
    const buffer = Buffer.alloc(MiB);
    for (let i = 0; i < buffer.length; i++) buffer[i] = i % 251;
    yield {
      name: 'objects/local/large-original.bin',
      keepHash: true,
      source: (async function* () {
        for (let offset = 0; offset < job.bytes; offset += buffer.length) {
          if (job.scope === 'source-failure' && offset >= MiB)
            throw new Error('INJECTED_SOURCE_READ_FAILURE');
          yield buffer.subarray(0, Math.min(buffer.length, job.bytes - offset));
        }
      })(),
    };
    return;
  }
  yield {
    name: 'database/ariso.db',
    source: createReadStream(job.database),
    keepHash: true,
  };
  yield {
    name: 'secrets.json',
    source: [
      Buffer.from('{"originalEncryptionKey":"EXPERIMENT_ONLY_NOT_A_REAL_KEY"}'),
    ],
    keepHash: true,
  };
  yield {
    name: 'assets/branding/站点标识.txt',
    source: [Buffer.from('Ariso 中文站点\n')],
    keepHash: true,
  };
  yield {
    name: 'objects/local/a.bin',
    source: [Buffer.alloc(300123, 0x5a)],
    keepHash: true,
  };
  yield {
    name: 'objects/local/b.bin',
    source: [Buffer.from('different bytes\0\xff')],
    keepHash: true,
  };
}

try {
  let result;
  if (workerData.kind === 'archive')
    result = await writeEncryptedArchive(
      workerData.target,
      sources(workerData),
      progress,
    );
  else if (workerData.kind === 'yazl-archive')
    result = await (
      await import('./yazl-archive.mjs')
    ).writeYazlControl(workerData, progress);
  else if (workerData.kind === 'decrypt')
    result = await decryptFile(
      workerData.source,
      workerData.target,
      workerData.password,
      progress,
    );
  else if (workerData.kind === 'encrypt-file')
    result = await encryptFile(workerData.source, workerData.target, progress);
  else if (workerData.kind === 'validate')
    result = await validateZip(
      workerData.source,
      workerData.expected,
      progress,
    );
  else throw new Error(`Unknown experiment job: ${workerData.kind}`);
  parentPort.postMessage({ type: 'result', ok: true, result });
} catch (error) {
  parentPort.postMessage({
    type: 'result',
    ok: false,
    error: { name: error.name, message: error.message },
  });
} finally {
  parentPort.close();
}
