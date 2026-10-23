import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  createBackupBrowserS3,
  loadBackupBrowserProvider,
} from './browser-backup-s3.mjs';
import { serializeBackupBrowserReport } from '../e2e/backup-secrets.mjs';
import {
  backupTestOwner,
  expectHttp,
  heldPublicUpload,
  httpJson,
  startBackupProductionInstance,
  waitForBackupJob,
  waitUntil,
} from '../tests/integration/backup/production-fixture.ts';

/** Two disposable real standalone instances; never creates or finishes an Ego space. */
export async function runBackupBrowser({
  spaceId,
  pageLabel,
  output,
  runBrowser,
  signal,
  secrets,
  storageConfig = '',
}) {
  const credentials = {
    ...backupTestOwner,
    password: randomBytes(24).toString('hex'),
  };
  const password = `Browser backup ${randomBytes(24).toString('hex')} 密码`;
  secrets.push(credentials.password, password);
  const report = { status: 'failed', checks: [] };
  const download = join(output, 'backup.age');
  let source, target, held, remote, failure;
  try {
    await rm(download, { force: true });
    for (const phase of ['create', 'download', 'restore', 'activated']) {
      await rm(join(output, `backup-${phase}.json`), { force: true });
    }
    signal.throwIfAborted();
    if (storageConfig) {
      const provider = await loadBackupBrowserProvider(resolve(storageConfig));
      secrets.push(
        provider.credentials.accessKeyId,
        provider.credentials.secretAccessKey,
      );
      remote = createBackupBrowserS3(provider);
      report.remote = remote.report;
    }
    source = await startBackupProductionInstance();
    signal.throwIfAborted();
    target = await startBackupProductionInstance();
    const targetOrigin = target.origin.replace('127.0.0.1', 'localhost');
    const setupCode = target.setupCode();
    assert.ok(setupCode, 'The empty target has a current setup code');
    secrets.push(setupCode);
    report.application = source.application;
    await source.initialize(credentials);
    await source.login(credentials);
    const { key } = await httpJson(
      await source.ownerJson('/api/upload-tokens', 'POST', {
        name: 'Browser backup fixture',
      }),
      200,
      'Create source upload token',
    );
    secrets.push(key);
    const { album } = await httpJson(
      await source.ownerJson('/api/albums', 'POST', {
        name: '浏览器恢复相册',
      }),
      201,
      'Create source album',
    );
    const { tag } = await httpJson(
      await source.ownerJson('/api/tags', 'POST', {
        name: '浏览器恢复标签',
      }),
      201,
      'Create source tag',
    );
    const bytes = await readFile(
      resolve('tests/fixtures/media-formats/source.png'),
    );
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/png' }), 'backup.png');
    form.append('visibility', 'public');
    const image = await httpJson(
      await source.request('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: form,
      }),
      201,
      'Upload source image',
    );
    assert.ok(
      image.imageId && image.versions.thumbnail,
      'A real thumbnail is ready',
    );
    await expectHttp(
      await source.ownerJson(
        `/api/images/${image.imageId}/collections`,
        'PATCH',
        {
          albumIds: [album.id],
          tagIds: [tag.id],
        },
      ),
      200,
      'Attach source relationships',
    );
    if (remote)
      await remote.prepare({
        source,
        bytes,
        token: key,
        albumId: album.id,
        tagId: tag.id,
        signal,
      });
    const publicUrl = new URL(image.versions.original.url);
    const common = {
      spaceId,
      pageLabel,
      output,
      credentials,
      sourceOrigin: source.origin,
      targetOrigin,
      imageId: image.imageId,
      publicPath: publicUrl.pathname + publicUrl.search,
      albumId: album.id,
      tagId: tag.id,
      download,
      helperScript: pathToFileURL(resolve('e2e/backup.mjs')).href,
    };
    async function scene(phase, extra = {}) {
      signal.throwIfAborted();
      await runBrowser(
        '../e2e/backup-run.mjs',
        { ...common, ...extra, phase },
        `backup-${phase}.log`,
      );
      const result = JSON.parse(
        await readFile(join(output, `backup-${phase}.json`), 'utf8'),
      );
      assert.equal(result.status, 'passed', `Backup browser phase ${phase}`);
      report.checks.push(phase);
      return result;
    }
    // Hold an actual admitted request so the backup's read-only window is observable.
    held = heldPublicUpload(source, key, bytes, [
      ['visibility', 'public'],
      ['albumId', album.id],
      ['tag', '浏览器恢复标签'],
    ]);
    await waitUntil(
      () => {
        signal.throwIfAborted();
        assert.equal(held.settled, false, 'Held upload remains pending');
        const db = new Database(join(source.dataDir, 'ariso.db'), {
          readonly: true,
        });
        try {
          return db
            .prepare(
              "SELECT count(*) AS count FROM upload_sessions WHERE state='receiving'",
            )
            .get().count;
        } finally {
          db.close();
        }
      },
      (count) => count > 0,
      'Upload admission before backup',
    );
    const { backupId } = await scene('create', { password });
    assert.ok(backupId, 'Browser supplied its real backup ID');
    held.release();
    const lateImage = await httpJson(
      await held.response,
      201,
      'Finish admitted upload',
    );
    await waitForBackupJob(source, backupId);
    await scene('download', { backupId });
    await chmod(download, 0o600);
    // A complete restore must succeed after the original DATA_DIR and S3 files are gone.
    await source.removeData();
    if (remote) await remote.removeSource();
    report.checks.push('source-data-removed');
    await scene('restore', {
      password,
      setupCode,
      ...(remote ? { restoreTargets: remote.restoreTargets } : {}),
    });
    signal.throwIfAborted();
    await target.restart();
    await scene('activated', {
      imageIds: [image.imageId, ...(remote?.imageIds ?? []), lateImage.imageId],
      ...(remote
        ? {
            remoteStorageIds: remote.restoreTargets.map(
              (target) => target.storageId,
            ),
          }
        : {}),
    });
    if (remote) await remote.verifyAfterRestore();
    report.status = 'passed';
  } catch (error) {
    failure = error;
    report.error = error.stack ?? String(error);
    report.diagnostics = {
      source: source?.diagnostics(),
      target: target?.diagnostics(),
    };
  } finally {
    held?.abort();
    if (held) await Promise.allSettled([held.response]);
    const closed = await Promise.allSettled([source?.close(), target?.close()]);
    const errors = closed
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (remote) {
      try {
        await remote.close();
      } catch (error) {
        errors.push(error);
      }
    }
    report.cleanup = errors.length ? 'failed' : 'passed';
    if (errors.length) {
      report.status = 'failed';
      failure = new AggregateError(
        [...(failure ? [failure] : []), ...errors],
        'Backup browser fixture cleanup failed',
      );
      report.cleanupErrors = errors.map(String);
    }
    const safe = serializeBackupBrowserReport(report, secrets);
    await writeFile(join(output, 'backup.json'), `${safe}\n`);
  }
  if (failure) throw failure;
}
