import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createReadStream } from 'node:fs';
import { rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { createEncryptedArchive } from './archive.ts';
import { decryptArchiveFile } from './decrypt.ts';
import { snapshotDatabase } from './snapshot.ts';
import { backupSummary, buildBackupManifest } from './manifest.ts';
import { iterateBackupEntries } from './source.ts';
import { inspectBackup, prepareRestore } from './restore.ts';
import { BackupError } from './errors.ts';
import { createRestoreRemote } from './restore-remote.ts';
import { readRestoreRemoteSources } from './restore-sources.ts';
import type {
  BackupWorkerInput,
  BackupWorkerProgress,
  BackupWorkerResult,
} from './worker-protocol.ts';

async function requireSpace(directory: string, bytes: number) {
  const disk = await statfs(directory);
  if (disk.bavail * disk.bsize < bytes)
    throw new BackupError(
      'BACKUP_NO_SPACE',
      507,
      '可用磁盘空间不足，请释放空间后重试',
    );
}

export async function performBackupWork(
  input: BackupWorkerInput,
  signal: AbortSignal,
  notify: (event: BackupWorkerProgress) => void,
): Promise<BackupWorkerResult> {
  let lastProgress = 0;
  const report = (event: BackupWorkerProgress, force = false) => {
    if (force || Date.now() - lastProgress >= 250) {
      lastProgress = Date.now();
      notify(event);
    }
  };
  signal.throwIfAborted();
  if (input.kind === 'backup') {
    report({ type: 'progress', stage: 'preparing' }, true);
    const databasePath = join(input.jobDirectory, 'snapshot.db');
    const source = new Database(join(input.dataDir, 'ariso.db'), {
      readonly: true,
      fileMustExist: true,
    });
    let snapshot: Awaited<ReturnType<typeof snapshotDatabase>>;
    try {
      snapshot = await snapshotDatabase({
        db: drizzle(source),
        destination: databasePath,
      });
    } finally {
      source.close();
    }
    signal.throwIfAborted();
    const manifest = await buildBackupManifest({
      databasePath,
      dataDir: input.dataDir,
      application: input.application,
      ...snapshot,
    });
    const summary = backupSummary(manifest);
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const secrets = Buffer.from(
      JSON.stringify({
        originalEncryptionKey: Buffer.from(input.encryptionKey).toString('hex'),
      }),
    );
    const databaseBytes = (await stat(databasePath)).size;
    const bytesTotal =
      manifest.bytes + manifestBytes.length + secrets.length + databaseBytes;
    const objectsTotal = manifest.objects + 3;
    await requireSpace(
      input.jobDirectory,
      bytesTotal + objectsTotal * 1024 + 16 * 1024 * 1024,
    );
    const progress = { objectsDone: 0, objectsTotal, bytesDone: 0, bytesTotal };
    report({ type: 'progress', stage: 'copying', summary, progress }, true);
    const archive = await createEncryptedArchive({
      destination: join(input.jobDirectory, input.fileName),
      password: input.password,
      signal,
      entries: (async function* () {
        yield { name: 'manifest.json', source: manifestBytes };
        yield {
          name: 'database/ariso.db',
          source: createReadStream(databasePath),
          size: databaseBytes,
        };
        yield { name: 'secrets.json', source: secrets };
        yield* iterateBackupEntries({
          databasePath,
          dataDir: input.dataDir,
          encryptionKey: input.encryptionKey,
          signal,
        });
      })(),
      onProgress(value) {
        report({
          type: 'progress',
          stage: 'copying',
          progress: {
            ...progress,
            objectsDone: value.entries,
            bytesDone: value.bytes,
          },
        });
      },
      onFinalizing() {
        report(
          {
            type: 'progress',
            stage: 'finalizing',
            progress: {
              ...progress,
              objectsDone: objectsTotal,
              bytesDone: bytesTotal,
            },
          },
          true,
        );
      },
    });
    return { kind: 'backup', summary, fileBytes: archive.archiveBytes };
  }
  const source = join(input.jobDirectory, 'content.zip');
  if (input.kind === 'inspect') {
    report({ type: 'progress', stage: 'decrypting' }, true);
    const encrypted = join(input.jobDirectory, 'source.zip.age');
    await requireSpace(
      input.jobDirectory,
      (await stat(encrypted)).size + 16 * 1024 * 1024,
    );
    await rm(source, { force: true });
    await rm(`${source}.part`, { force: true });
    await decryptArchiveFile({
      source: encrypted,
      destination: source,
      password: input.password,
      signal,
    });
    const inspected = await inspectBackup({
      source,
      workDirectory: join(input.jobDirectory, 'work'),
      application: input.application,
      signal,
    });
    return { kind: 'inspect', summary: inspected.summary };
  }
  report({ type: 'progress', stage: 'restoring' }, true);
  const summary = await prepareRestore({
    source,
    jobDirectory: input.jobDirectory,
    application: input.application,
    encryptionKey: input.encryptionKey,
    publicUrl: input.publicUrl,
    remote: createRestoreRemote({
      jobDirectory: input.jobDirectory,
      jobId: input.jobId,
      encryptionKey: input.encryptionKey,
      sources: readRestoreRemoteSources(input.jobDirectory),
    }),
    signal,
    onProgress(progress) {
      report({ type: 'progress', stage: 'restoring', progress });
    },
  });
  return { kind: 'restore', summary };
}
