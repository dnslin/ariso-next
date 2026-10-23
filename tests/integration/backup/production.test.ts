import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { RESTORE_CHUNK_BYTES } from '../../../src/server/backup/restore-upload.ts';
import type {
  BackupJob,
  RestoreJob,
} from '../../../src/server/backup/types.ts';
import {
  publicUploadSuccessSchema,
  type PublicUploadSuccess,
} from '../../../src/server/upload/public-contract.ts';
import {
  backupTestOwner,
  expectHttp,
  heldPublicUpload,
  httpJson,
  requirePackagedBackupBuild,
  restoreResponseWithoutBody,
  startBackupProductionInstance,
  waitForBackupJob,
  waitForRestoreJob,
  waitUntil,
  type BackupProductionInstance,
} from './production-fixture.ts';

const execute = promisify(execFile);
const ownedInstances = new Set<BackupProductionInstance>();
const ownedDirectories = new Set<string>();
afterEach(async () => {
  // Vitest also runs this hook after a test timeout, while the request may still be pending.
  const closed = await Promise.allSettled(
    [...ownedInstances].map((instance) => instance.close()),
  );
  ownedInstances.clear();
  const removed = await Promise.allSettled(
    [...ownedDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  ownedDirectories.clear();
  const failures = [...closed, ...removed].filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Backup HTTP fixture cleanup failed',
    );
});
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const relativeUrl = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};
const form = (bytes: Buffer, name = '备份验证.png') => {
  const value = new FormData();
  value.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    name,
  );
  return value;
};
function database<T>(
  instance: BackupProductionInstance,
  read: (db: Database.Database) => T,
): T {
  const db = new Database(join(instance.dataDir, 'ariso.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return read(db);
  } finally {
    db.close();
  }
}
function count(instance: BackupProductionInstance, table: string) {
  return database(
    instance,
    (db) =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number })
        .n,
  );
}
function savedRelations(instance: BackupProductionInstance) {
  return database(instance, (db) => ({
    site: db
      .prepare('SELECT name,description,time_zone FROM site_settings')
      .all(),
    images: db
      .prepare(
        'SELECT id,storage_id,original_name,display_name,visibility FROM media_images ORDER BY id',
      )
      .all(),
    versions: db
      .prepare(
        'SELECT image_id,kind,object_id,byte_size FROM media_versions ORDER BY image_id,kind',
      )
      .all(),
    sizes: db
      .prepare(
        'SELECT image_id,source_version,preset,source_object_id,object_id FROM media_size_versions ORDER BY image_id,source_version,preset',
      )
      .all(),
    albums: db
      .prepare('SELECT id,name,description FROM albums ORDER BY id')
      .all(),
    tags: db
      .prepare('SELECT id,display_name,normalized_key FROM tags ORDER BY id')
      .all(),
    albumImages: db
      .prepare(
        'SELECT album_id,image_id,joined_at FROM album_images ORDER BY album_id,image_id',
      )
      .all(),
    imageTags: db
      .prepare(
        'SELECT image_id,tag_id FROM image_tags ORDER BY image_id,tag_id',
      )
      .all(),
  }));
}
async function uploaded(response: Response, label: string) {
  return publicUploadSuccessSchema.parse(
    await httpJson<unknown>(response, 201, label),
  );
}
async function imageBytes(
  instance: BackupProductionInstance,
  upload: PublicUploadSuccess,
) {
  const saved = new Map<
    string,
    { path: string; digest: string; bytes: number }
  >();
  expect(Object.keys(upload.versions).sort()).toEqual([
    'compressed',
    'original',
    'thumbnail',
    'watermark',
  ]);
  for (const [kind, version] of Object.entries(upload.versions)) {
    const path = relativeUrl(version!.url);
    const response = await expectHttp(
      await instance.request(path),
      200,
      `Read ${kind} image version`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    saved.set(`${upload.imageId}:${kind}`, {
      path,
      digest: digest(bytes),
      bytes: bytes.length,
    });
  }
  return saved;
}

it('backs up a real Local site and restores it after the entire source DATA_DIR is gone', async () => {
  const application = requirePackagedBackupBuild();
  const directory = await mkdtemp(join(tmpdir(), 'ariso-local-recovery-e2e-'));
  ownedDirectories.add(directory);
  let source: BackupProductionInstance | undefined;
  let target: BackupProductionInstance | undefined;
  let held: ReturnType<typeof heldPublicUpload> | undefined;
  const sourceKey = randomBytes(32);
  const targetKey = randomBytes(32);
  const backupPassword = '  本地恢复 fixture 密码  ';
  const smtpPassword = 'fixture-smtp-password-never-sent';
  const sharePassword = 'fixture-share-password';
  try {
    const largePath = join(directory, 'large.png');
    await execute(
      'magick',
      [
        '-size',
        '2048x1536',
        'xc:#89bd9d',
        '-define',
        'png:compression-level=0',
        `PNG24:${largePath}`,
      ],
      {
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}`,
        },
      },
    );
    const large = await readFile(largePath);
    const small = await readFile(
      resolve('tests/fixtures/media-formats/source.png'),
    );
    expect(large.byteLength).toBeGreaterThan(RESTORE_CHUNK_BYTES);
    source = await startBackupProductionInstance({
      directory: join(directory, 'source'),
      encryptionKey: sourceKey.toString('hex'),
    });
    ownedInstances.add(source);
    const sourceSetupCode = source.setupCode()!;
    await source.initialize();
    await source.login();
    const oldCookie = source.ownerCookie();
    await expectHttp(
      await source.request('/api/backups'),
      401,
      'Backup requires owner',
    );
    const initialized = await httpJson<{ code: string; redirectTo: string }>(
      await source.request('/api/setup/restore', {
        headers: { 'X-Ariso-Setup-Code': sourceSetupCode },
      }),
      409,
      'Initialized source rejects restore',
    );
    expect(initialized).toMatchObject({
      code: 'SETUP_ALREADY_COMPLETED',
      redirectTo: '/login',
    });

    const logo = await httpJson<{ url: string }>(
      await source.owner('/api/settings/site/branding/logo', {
        method: 'PUT',
        body: form(small, 'logo.png'),
      }),
      200,
      'Save branding image',
    );
    const watermark = await httpJson<{ id: string }>(
      await source.owner('/api/media/watermark-assets', {
        method: 'POST',
        body: form(small, 'watermark.png'),
      }),
      201,
      'Save watermark asset',
    );
    await expectHttp(
      await source.ownerJson('/api/settings/media', 'PATCH', {
        watermarkMode: 'image',
        watermarkAssetId: watermark.id,
        defaultLinkVersion: 'watermark',
      }),
      200,
      'Enable persisted image watermark',
    );
    const token = await httpJson<{ key: string; token: { id: string } }>(
      await source.ownerJson('/api/upload-tokens', 'POST', {
        name: 'Restore continuity',
      }),
      200,
      'Create upload token',
    );
    expect(typeof token.key === 'string' && token.key.length > 0).toBe(true);
    const first = await uploaded(
      await source.request('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${token.key}` },
        body: form(large),
        signal: AbortSignal.timeout(120_000),
      }),
      'Upload real PNG',
    );
    expect(first.actualVersion).toBe('watermark');
    const images = await imageBytes(source, first);
    expect(images.get(`${first.imageId}:original`)?.digest).toBe(digest(large));

    const album = await httpJson<{ album: { id: string } }>(
      await source.ownerJson('/api/albums', 'POST', {
        name: '恢复相册',
        description: '必须保留的相册说明',
      }),
      201,
      'Create album',
    );
    const tag = await httpJson<{ tag: { id: string } }>(
      await source.ownerJson('/api/tags', 'POST', { name: '恢复标签' }),
      201,
      'Create tag',
    );
    await expectHttp(
      await source.ownerJson(
        `/api/images/${first.imageId}/collections`,
        'PATCH',
        { albumIds: [album.album.id], tagIds: [tag.tag.id] },
      ),
      200,
      'Attach image relationships',
    );
    const shared = await httpJson<{ share: { token: string; id: string } }>(
      await source.ownerJson(`/api/albums/${album.album.id}/share`, 'POST', {
        password: { action: 'set', value: sharePassword },
        layout: 'grid',
        showName: true,
      }),
      200,
      'Create protected album share',
    );
    const unlock = await expectHttp(
      await source.request(`/s/${shared.share.token}/unlock`, {
        method: 'POST',
        headers: { origin: source.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ password: sharePassword }),
      }),
      200,
      'Unlock source share',
    );
    const oldShareCookie = unlock.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(oldShareCookie.length > 0).toBe(true);
    await expectHttp(
      await source.request(`/s/${shared.share.token}/items`, {
        headers: { cookie: oldShareCookie },
      }),
      200,
      'Read unlocked source share',
    );
    await expectHttp(
      await source.ownerJson('/api/settings/smtp', 'PATCH', {
        host: 'smtp.example.invalid',
        port: 465,
        mode: 'tls',
        username: 'fixture-user',
        password: smtpPassword,
        fromName: 'Fixture',
        fromEmail: 'sender@example.test',
      }),
      200,
      'Save SMTP without sending mail',
    );

    await expectHttp(
      await source.ownerJson(`/api/images/${first.imageId}/sizes`, 'POST', {
        version: 'compressed',
        preset: 'small',
      }),
      202,
      'Create a saved size version',
    );
    const size = await waitUntil(
      async () =>
        httpJson<{ status: string; links: { url: string } | null }>(
          await source!.owner(
            `/api/images/${first.imageId}/sizes?version=compressed&preset=small`,
          ),
          200,
          'Read saved size progress',
        ),
      (value) => value.status === 'ready',
      'Saved size processing',
      60_000,
    );
    expect(size.links).not.toBeNull();
    const sizePath = relativeUrl(size.links!.url);
    const sizeBytes = new Uint8Array(
      await (
        await expectHttp(
          await source.request(sizePath),
          200,
          'Read saved size bytes',
        )
      ).arrayBuffer(),
    );
    const logoBytes = new Uint8Array(
      await (
        await expectHttp(
          await source.request(logo.url),
          200,
          'Read source branding',
        )
      ).arrayBuffer(),
    );

    // A real accepted upload keeps preparation open until its processing result has settled.
    held = heldPublicUpload(source, token.key, small, [
      ['visibility', 'public'],
      ['albumId', album.album.id],
      ['tag', '恢复标签'],
    ]);
    await waitUntil(
      () => {
        if (held!.settled)
          throw new Error('Held upload ended before the pause exercise');
        return database(
          source!,
          (db) =>
            (
              db
                .prepare(
                  "SELECT count(*) AS n FROM upload_sessions WHERE state='receiving'",
                )
                .get() as { n: number }
            ).n,
        );
      },
      (value) => value > 0,
      'Public receiver admission',
    );
    const backupId = randomUUID();
    const created = await httpJson<{ job: BackupJob }>(
      await source.ownerJson(`/api/backups/${backupId}`, 'PUT', {
        password: backupPassword,
      }),
      202,
      'Create encrypted backup',
    );
    expect(created.job.status).toBe('preparing');
    const paused = await httpJson<{ paused: boolean }>(
      await source.owner('/api/backups/activity'),
      200,
      'Read pause state',
    );
    expect(paused.paused).toBe(true);
    const blocked = await httpJson<{ code: string }>(
      await source.ownerJson('/api/albums', 'POST', {
        name: 'Must not be created',
      }),
      409,
      'Pause new content changes',
    );
    expect(blocked.code).toBe('SITE_BACKUP_IN_PROGRESS');
    const during = new Uint8Array(
      await (
        await expectHttp(
          await source.request(relativeUrl(first.versions.original!.url)),
          200,
          'Browse during backup',
        )
      ).arrayBuffer(),
    );
    expect(digest(during)).toBe(digest(large));
    held.release();
    const second = await uploaded(
      await held.response,
      'Settle the admitted public upload',
    );
    for (const [name, entry] of await imageBytes(source, second))
      images.set(name, entry);
    const backup = await waitForBackupJob(source, backupId);
    expect(backup.summary?.images).toBe(2);
    expect(backup.application).toEqual(application);
    expect(
      (
        await httpJson<{ paused: boolean }>(
          await source.owner('/api/backups/activity'),
          200,
          'Pause released',
        )
      ).paused,
    ).toBe(false);
    const relations = savedRelations(source);
    const sourceSecrets = database(source, (db) => ({
      ownerId: (db.prepare('SELECT id FROM user').get() as { id: string }).id,
      credential: (
        db
          .prepare(
            "SELECT password FROM account WHERE provider_id='credential'",
          )
          .get() as { password: string }
      ).password,
      uploadKey: (
        db.prepare('SELECT key FROM apikey WHERE id=?').get(token.token.id) as {
          key: string;
        }
      ).key,
      smtp: (
        db
          .prepare(
            'SELECT password_encrypted AS secret FROM identity_smtp_settings',
          )
          .get() as { secret: string }
      ).secret,
      watermarkPath: (
        db
          .prepare('SELECT path FROM media_watermark_assets WHERE id=?')
          .get(watermark.id) as { path: string }
      ).path,
    }));
    expect(count(source, 'session')).toBeGreaterThan(0);
    expect(count(source, 'share_grants')).toBeGreaterThan(0);
    const head = await expectHttp(
      await source.owner(`/api/backups/${backupId}/file`, { method: 'HEAD' }),
      200,
      'Backup HEAD metadata',
    );
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(
      RESTORE_CHUNK_BYTES,
    );
    const downloaded = await expectHttp(
      await source.owner(`/api/backups/${backupId}/file`),
      200,
      'Download encrypted archive',
    );
    expect(downloaded.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    const encrypted = Buffer.from(await downloaded.arrayBuffer());
    expect(encrypted.length).toBe(Number(head.headers.get('content-length')));
    expect(encrypted.subarray(0, 22).toString()).toBe(
      'age-encryption.org/v1\n',
    );
    const backupFile = join(directory, 'downloaded.zip.age');
    await writeFile(backupFile, encrypted);
    await source.removeData();
    expect(existsSync(source.dataDir)).toBe(false);

    target = await startBackupProductionInstance({
      directory: join(directory, 'target'),
      encryptionKey: targetKey.toString('hex'),
    });
    ownedInstances.add(target);
    expect(target.application).toEqual(application);
    expect(sourceKey.equals(targetKey)).toBe(false);
    await waitUntil(
      () => count(target!, 'storage_scans'),
      (value) => value > 0,
      'Blank target automatic storage scan',
    );
    expect(count(target, 'user')).toBe(0);
    const restoreId = randomUUID();
    await expectHttp(
      await restoreResponseWithoutBody(target, restoreId),
      401,
      'Reject upload headers before any body',
    );
    expect(existsSync(join(target.dataDir, 'restore', restoreId))).toBe(false);
    const bytes = await readFile(backupFile);
    await expectHttp(
      await target.restoreJson(`/api/setup/restore/${restoreId}`, 'PUT', {
        uploadBytes: bytes.length,
      }),
      201,
      'Create restore on blank target',
    );
    const attemptSetup = () =>
      target!.request('/api/setup', {
        method: 'POST',
        headers: { origin: target!.origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          code: target!.setupCode(),
          ...backupTestOwner,
          publicUrl: target!.origin,
          timeZone: 'UTC',
        }),
      });
    await expectHttp(
      await attemptSetup(),
      409,
      'Normal setup cannot overtake a restore',
    );
    const oldSetupCode = target.setupCode()!;
    const sendChunk = async (offset: number) => {
      const end = Math.min(offset + RESTORE_CHUNK_BYTES, bytes.length);
      const response = await target!.restore(
        `/api/setup/restore/${restoreId}/file`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/octet-stream',
            'Upload-Offset': String(offset),
            'Upload-Length': String(bytes.length),
          },
          body: new Uint8Array(bytes.subarray(offset, end)),
        },
      );
      const { job } = await httpJson<{ job: RestoreJob }>(
        response,
        200,
        'Receive encrypted backup chunk',
      );
      expect(job.receivedBytes).toBe(end);
      return job;
    };
    expect((await sendChunk(0)).status).toBe('receiving');
    await target.restart();
    expect(target.setupCode() === oldSetupCode).toBe(false);
    await expectHttp(
      await target.restoreJson(
        '/api/setup/restore',
        'GET',
        undefined,
        oldSetupCode,
      ),
      401,
      'Old initialization code expires after restart',
    );
    const interrupted = await httpJson<{ job: RestoreJob }>(
      await target.restore('/api/setup/restore'),
      200,
      'Read interrupted upload',
    );
    expect(interrupted.job.status).toBe('interrupted');
    expect(interrupted.job.failedPhase).toBe('receiving');
    const reset = await httpJson<{ job: RestoreJob }>(
      await target.restore(`/api/setup/restore/${restoreId}/file`, {
        method: 'DELETE',
      }),
      200,
      'Reset incomplete upload',
    );
    expect(reset.job.receivedBytes).toBe(0);
    let chunkCount = 0;
    for (let offset = 0; offset < bytes.length; offset += RESTORE_CHUNK_BYTES) {
      await sendChunk(offset);
      chunkCount++;
    }
    expect(chunkCount).toBeGreaterThan(1);
    await expectHttp(
      await target.restoreJson(
        `/api/setup/restore/${restoreId}/decryption`,
        'POST',
        { password: 'wrong-password' },
      ),
      202,
      'Attempt wrong backup password',
    );
    const failed = await waitForRestoreJob(target, restoreId, 'failed');
    expect(failed.failedPhase).toBe('decrypting');
    expect(
      existsSync(join(target.dataDir, 'restore', restoreId, 'ready')),
    ).toBe(false);
    await expectHttp(
      await target.restoreJson(
        `/api/setup/restore/${restoreId}/decryption`,
        'POST',
        { password: backupPassword },
      ),
      202,
      'Retry correct backup password',
    );
    const inspected = await waitForRestoreJob(target, restoreId, 'configuring');
    expect(inspected.summary).toMatchObject({
      images: 2,
      albums: 1,
      tags: 1,
      ownerEmail: backupTestOwner.email,
    });
    await expectHttp(
      await target.restoreJson(`/api/setup/restore/${restoreId}/site`, 'PUT', {
        publicUrl: target.origin,
      }),
      200,
      'Configure new public URL',
    );
    await expectHttp(
      await target.restoreJson(
        `/api/setup/restore/${restoreId}/execution`,
        'POST',
      ),
      202,
      'Prepare restored Local files',
    );
    await waitForRestoreJob(target, restoreId, 'ready');
    expect(count(target, 'user')).toBe(0);
    await expectHttp(
      await attemptSetup(),
      409,
      'Ready data still cannot be overwritten by setup',
    );
    const portBeforeActivation = target.origin;
    await target.restart();
    expect(target.origin).toBe(portBeforeActivation);
    expect(count(target, 'session')).toBe(0);
    expect(count(target, 'share_grants')).toBe(0);
    await expectHttp(
      await target.request('/api/account', { headers: { cookie: oldCookie } }),
      401,
      'Old source session is invalid',
    );
    await target.login();
    expect(savedRelations(target)).toEqual(relations);
    const targetSecrets = database(target, (db) => ({
      ownerId: (db.prepare('SELECT id FROM user').get() as { id: string }).id,
      credential: (
        db
          .prepare(
            "SELECT password FROM account WHERE provider_id='credential'",
          )
          .get() as { password: string }
      ).password,
      uploadKey: (
        db.prepare('SELECT key FROM apikey WHERE id=?').get(token.token.id) as {
          key: string;
        }
      ).key,
      smtp: (
        db
          .prepare(
            'SELECT password_encrypted AS secret FROM identity_smtp_settings',
          )
          .get() as { secret: string }
      ).secret,
      shareToken: (
        db
          .prepare('SELECT token FROM album_shares WHERE album_id=?')
          .get(album.album.id) as { token: string }
      ).token,
    }));
    expect(
      database(
        target,
        (db) =>
          (
            db.prepare('SELECT public_url AS url FROM site_settings').get() as {
              url: string;
            }
          ).url,
      ),
    ).toBe(target.origin);
    expect(targetSecrets.ownerId === sourceSecrets.ownerId).toBe(true);
    expect(targetSecrets.credential === sourceSecrets.credential).toBe(true);
    expect(targetSecrets.uploadKey === sourceSecrets.uploadKey).toBe(true);
    expect(targetSecrets.shareToken === shared.share.token).toBe(true);
    expect(targetSecrets.smtp === sourceSecrets.smtp).toBe(false);
    expect(
      createSecretCrypto(targetKey).decryptSecret(
        targetSecrets.smtp,
        'restored SMTP',
      ) === smtpPassword,
    ).toBe(true);
    let oldKeyRejected = false;
    try {
      createSecretCrypto(sourceKey).decryptSecret(
        targetSecrets.smtp,
        'old deployment key',
      );
    } catch {
      oldKeyRejected = true;
    }
    expect(oldKeyRejected).toBe(true);
    for (const entry of images.values()) {
      const result = new Uint8Array(
        await (
          await expectHttp(
            await target.request(entry.path),
            200,
            'Read restored image version',
          )
        ).arrayBuffer(),
      );
      expect(result.length).toBe(entry.bytes);
      expect(digest(result)).toBe(entry.digest);
    }
    const restoredSize = new Uint8Array(
      await (
        await expectHttp(
          await target.request(sizePath),
          200,
          'Read restored size version',
        )
      ).arrayBuffer(),
    );
    expect(digest(restoredSize)).toBe(digest(sizeBytes));
    const restoredLogo = new Uint8Array(
      await (
        await expectHttp(
          await target.request(logo.url),
          200,
          'Read restored branding',
        )
      ).arrayBuffer(),
    );
    expect(digest(restoredLogo)).toBe(digest(logoBytes));
    expect(
      digest(
        await readFile(
          join(
            target.dataDir,
            'assets',
            'watermarks',
            sourceSecrets.watermarkPath,
          ),
        ),
      ),
    ).toBe(digest(small));
    await expectHttp(
      await target.request(`/s/${shared.share.token}/items`, {
        headers: { cookie: oldShareCookie },
      }),
      401,
      'Old share grant is invalid',
    );
    const reopened = await expectHttp(
      await target.request(`/s/${shared.share.token}/unlock`, {
        method: 'POST',
        headers: { origin: target.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ password: sharePassword }),
      }),
      200,
      'Original share password still works',
    );
    const newGrant = reopened.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const shareItems = await httpJson<{ items: { imageId: string }[] }>(
      await target.request(`/s/${shared.share.token}/items`, {
        headers: { cookie: newGrant },
      }),
      200,
      'Read restored share',
    );
    expect(shareItems.items.map((item) => item.imageId).sort()).toEqual(
      [first.imageId, second.imageId].sort(),
    );
    await expectHttp(
      await target.request('/api/setup/restore', {
        headers: { 'X-Ariso-Setup-Code': oldSetupCode },
      }),
      409,
      'Restored instance closes initialization',
    );

    const added = await uploaded(
      await target.request('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${token.key}` },
        body: form(small, '恢复后新增.png'),
        signal: AbortSignal.timeout(120_000),
      }),
      'Original upload token still works',
    );
    const afterAlbum = await httpJson<{ album: { id: string } }>(
      await target.ownerJson('/api/albums', 'POST', { name: '恢复后新增相册' }),
      201,
      'Create new post-restore data',
    );
    await expectHttp(
      await target.ownerJson(`/api/images/${first.imageId}`, 'PATCH', {
        displayName: '恢复后编辑',
      }),
      200,
      'Edit restored image',
    );
    await target.restart();
    await target.login();
    expect(count(target, 'media_images')).toBe(3);
    expect(
      database(
        target,
        (db) =>
          !!db
            .prepare('SELECT 1 FROM media_images WHERE id=?')
            .get(added.imageId),
      ),
    ).toBe(true);
    expect(
      database(
        target,
        (db) =>
          !!db
            .prepare('SELECT 1 FROM albums WHERE id=?')
            .get(afterAlbum.album.id),
      ),
    ).toBe(true);
    expect(
      database(
        target,
        (db) =>
          (
            db
              .prepare(
                'SELECT display_name AS name FROM media_images WHERE id=?',
              )
              .get(first.imageId) as { name: string }
          ).name,
      ),
    ).toBe('恢复后编辑');
    expect(existsSync(source.dataDir)).toBe(false);
    expect((await stat(backupFile)).size).toBe(bytes.length);
  } catch (error) {
    const diagnostics = {
      source: source?.diagnostics(),
      target: target?.diagnostics(),
    };
    throw new Error(
      `Local recovery HTTP scenario failed; ${JSON.stringify(diagnostics)}`,
      { cause: error },
    );
  } finally {
    if (held) {
      held.abort();
      await Promise.allSettled([held.response]);
    }
    try {
      await target?.close();
    } finally {
      try {
        await source?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
}, 180_000);

it('includes an empty disabled S3 configuration without contacting an unnecessary remote object', async () => {
  requirePackagedBackupBuild();
  const instance = await startBackupProductionInstance();
  ownedInstances.add(instance);
  try {
    await instance.initialize();
    await instance.login();
    await expectHttp(
      await instance.ownerJson('/api/storages', 'POST', {
        type: 's3',
        name: 'Empty disabled remote fixture',
        endpoint: 'http://127.0.0.1:9',
        region: 'test',
        bucket: 'test',
        accessKey: 'fixture-access-key',
        secretKey: 'fixture-secret-key',
        enabled: false,
      }),
      201,
      'Create disabled remote configuration',
    );
    const id = randomUUID();
    await expectHttp(
      await instance.ownerJson(`/api/backups/${id}`, 'PUT', {
        password: 'fixture backup password',
      }),
      202,
      'Create backup including S3 metadata',
    );
    const backup = await waitForBackupJob(instance, id);
    expect(backup.status).toBe('ready');
    expect(
      backup.summary?.storages.find((storage) => storage.type === 's3'),
    ).toMatchObject({
      type: 's3',
      enabled: false,
      images: 0,
      objects: 0,
      bytes: 0,
    });
    const overview = await httpJson<{ availability: { supported: boolean } }>(
      await instance.owner('/api/backups'),
      200,
      'Read mixed backup support',
    );
    expect(overview.availability.supported).toBe(true);
  } finally {
    await instance.close();
  }
}, 30_000);
