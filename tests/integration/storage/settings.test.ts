import { randomUUID } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import { mediaImages, mediaObjects } from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  deleteObject,
  readObject,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  uploadSessions,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  createStorage,
  listStorages,
  readStorage,
  readStorageSettings,
  requireLocalStorage,
  setDefaultStorage,
  updateStorage,
  verifyStorageSecrets,
} from '../../../src/server/storage/settings.ts';
import {
  storageCreateInputSchema,
  storageUpdateInputSchema,
} from '../../../src/server/storage/validation.ts';

let directory: string;
let storageRoot: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
const secretCrypto = createSecretCrypto(Buffer.alloc(32, 31));
const s3Input = {
  type: 's3',
  name: '归档 S3',
  endpoint: 'https://s3.example.test/',
  region: 'auto',
  bucket: 'photos',
  pathPrefix: '/archive/photos/',
  forcePathStyle: true,
  accessKey: 'integration-access-key',
  secretKey: 'integration-secret-key',
};
const context = () => ({ storageRoot, secretCrypto });
const create = (input: unknown) =>
  createStorage(
    connection.db,
    storageCreateInputSchema.parse(input),
    context(),
  );
const update = (id: string, input: unknown) =>
  updateStorage(
    connection.db,
    id,
    storageUpdateInputSchema.parse(input),
    context(),
  );
const row = (id: string) =>
  connection.db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, id))
    .get()!;
function reopen() {
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  prepareInitialStorage(connection.db, { storage: storageRoot });
}
function passedFixture(id: string) {
  // T-STO-04 owns real probes. Seed persisted results only to exercise revision/enable rules.
  const config = row(id);
  connection.db
    .update(storageConfigs)
    .set({
      connectionStatus: 'passed',
      connectionRevision: config.configRevision,
      connectionTestedAt: new Date(1000),
      corsStatus: 'passed',
      corsRevision: config.configRevision,
      corsOrigin: 'https://ariso.example.test',
      corsTestedAt: new Date(1000),
    })
    .where(eq(storageConfigs.id, id))
    .run();
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-storage-settings-'));
  storageRoot = join(directory, 'storage');
  mkdirSync(storageRoot);
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: storageRoot });
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('T-STO-03 多配置持久行为', () => {
  it('S3 全字段持久化、两项秘密加密，创建/列表/详情均不回显', () => {
    const created = create(s3Input);
    const stored = row(created.id);
    expect(stored).toMatchObject({
      type: 's3',
      enabled: false,
      localPath: null,
      endpoint: 'https://s3.example.test',
      region: 'auto',
      bucket: 'photos',
      pathPrefix: 'archive/photos',
      forcePathStyle: true,
      configRevision: 1,
      connectionStatus: 'untested',
      corsStatus: 'untested',
    });
    for (const [column, plaintext] of [
      ['accessKeyEncrypted', s3Input.accessKey],
      ['secretKeyEncrypted', s3Input.secretKey],
    ] as const) {
      expect(stored[column]).not.toBe(plaintext);
      expect(secretCrypto.decryptSecret(stored[column]!, column)).toBe(
        plaintext,
      );
    }
    reopen();
    expect(row(created.id)).toEqual(stored);
    for (const result of [
      created,
      readStorage(connection.db, created.id),
      listStorages(connection.db).find((item) => item.id === created.id)!,
    ]) {
      expect(result).toMatchObject({ hasAccessKey: true, hasSecretKey: true });
      for (const field of [
        'accessKey',
        'secretKey',
        'accessKeyEncrypted',
        'secretKeyEncrypted',
      ])
        expect(result).not.toHaveProperty(field);
      expect(JSON.stringify(result)).not.toContain(s3Input.accessKey);
      expect(JSON.stringify(result)).not.toContain(s3Input.secretKey);
    }
    connection.db.$client.pragma('wal_checkpoint(TRUNCATE)');
    const sqliteBytes = readFileSync(join(directory, 'ariso.db'));
    expect(sqliteBytes.includes(Buffer.from(s3Input.accessKey))).toBe(false);
    expect(sqliteBytes.includes(Buffer.from(s3Input.secretKey))).toBe(false);
  });

  it('字段省略保留密文，新字符串替换，null 清除单项秘密并在重开后保留', () => {
    const created = create(s3Input);
    const initial = row(created.id);
    update(created.id, { name: '改名' });
    expect(row(created.id)).toMatchObject({
      accessKeyEncrypted: initial.accessKeyEncrypted,
      secretKeyEncrypted: initial.secretKeyEncrypted,
      configRevision: 1,
    });
    update(created.id, { accessKey: 'replacement-access' });
    expect(
      secretCrypto.decryptSecret(row(created.id).accessKeyEncrypted!, 'access'),
    ).toBe('replacement-access');
    expect(row(created.id).secretKeyEncrypted).toBe(initial.secretKeyEncrypted);
    expect(row(created.id).configRevision).toBe(2);
    expect(update(created.id, { secretKey: null })).toMatchObject({
      hasAccessKey: true,
      hasSecretKey: false,
      configRevision: 3,
      enabled: false,
    });
    reopen();
    expect(row(created.id).secretKeyEncrypted).toBeNull();
    expect(update(created.id, { secretKey: null })).toMatchObject({
      configRevision: 3,
    });
    expect(() => update(created.id, { enabled: true })).toThrowError(
      expect.objectContaining({ code: 'STORAGE_TEST_REQUIRED' }),
    );
  });

  it('名称、默认和启停不失效，真实凭据变化失效连接/CORS 并停用但保留默认', () => {
    const created = create(s3Input);
    passedFixture(created.id);
    update(created.id, { enabled: true });
    setDefaultStorage(connection.db, created.id);
    update(created.id, {
      name: '新名称',
      accessKey: s3Input.accessKey,
      secretKey: s3Input.secretKey,
    });
    update(created.id, { enabled: false });
    expect(update(created.id, { enabled: true })).toMatchObject({
      configRevision: 1,
      connectionStatus: 'passed',
      connectionRevision: 1,
      corsStatus: 'passed',
      corsRevision: 1,
    });
    const changed = update(created.id, { secretKey: 'new-secret' });
    expect(changed).toMatchObject({
      configRevision: 2,
      enabled: false,
      connectionStatus: 'untested',
      connectionRevision: null,
      connectionTestedAt: null,
      corsStatus: 'invalidated',
      corsRevision: null,
      corsOrigin: null,
      corsTestedAt: null,
    });
    expect(readStorageSettings(connection.db).defaultStorageId).toBe(
      created.id,
    );
    expect(() => resolveUploadStorage(connection.db)).toThrowError(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_DISABLED' }),
    );
    expect(() => update(created.id, { enabled: true })).toThrowError(
      expect.objectContaining({ code: 'STORAGE_TEST_REQUIRED' }),
    );
  });

  it('拒绝旧 revision 测试结果启用，以及替换凭据同时启用；失败整笔回滚', () => {
    const created = create(s3Input);
    passedFixture(created.id);
    update(created.id, { secretKey: 'new-secret' });
    connection.db
      .update(storageConfigs)
      .set({ connectionStatus: 'passed', connectionRevision: 1 })
      .where(eq(storageConfigs.id, created.id))
      .run();
    expect(() => update(created.id, { enabled: true })).toThrowError(
      expect.objectContaining({ code: 'STORAGE_TEST_REQUIRED' }),
    );
    passedFixture(created.id);
    const before = row(created.id);
    expect(() =>
      update(created.id, { accessKey: 'other-access', enabled: true }),
    ).toThrowError(expect.objectContaining({ code: 'STORAGE_TEST_REQUIRED' }));
    expect(row(created.id)).toEqual(before);
  });

  it('停用配置也校验两项密文，错密钥失败不清空任何持久字段', () => {
    const created = create(s3Input);
    const before = row(created.id);
    expect(() =>
      verifyStorageSecrets(connection.db, secretCrypto),
    ).not.toThrow();
    expect(() =>
      verifyStorageSecrets(
        connection.db,
        createSecretCrypto(Buffer.alloc(32, 32)),
      ),
    ).toThrow('密文认证失败');
    reopen();
    expect(row(created.id)).toEqual(before);
  });

  it('local 与 S3 输入互斥，本地不能通过秘密更新留下 S3 凭据', () => {
    const before = listStorages(connection.db);
    expect(() =>
      create({
        type: 'local',
        name: '本地',
        localPath: 'disk',
        accessKey: 'secret',
      }),
    ).toThrow();
    expect(() => create({ ...s3Input, localPath: 'disk' })).toThrow();
    expect(() => create({ ...s3Input, enabled: true })).toThrow();
    const local = before[0];
    expect(() => update(local.id, { accessKey: 'secret' })).toThrowError(
      expect.objectContaining({ code: 'STORAGE_INVALID_INPUT' }),
    );
    expect(listStorages(connection.db)).toEqual(before);
    expect(row(local.id)).toMatchObject({
      endpoint: null,
      region: null,
      bucket: null,
      pathPrefix: null,
      forcePathStyle: null,
      accessKeyEncrypted: null,
      secretKeyEncrypted: null,
    });
  });

  it.each(['********', '••••••', '<redacted>', '[redacted]', ''])(
    '拒绝占位秘密 %j 且不覆盖原值',
    (value) => {
      const created = create(s3Input);
      const before = row(created.id);
      expect(() => update(created.id, { secretKey: value })).toThrow();
      expect(row(created.id)).toEqual(before);
    },
  );

  it('默认选择要求存在且启用，停用/清空后重开不补选其他可用配置', () => {
    const originalId = readStorageSettings(connection.db).defaultStorageId!;
    const second = create({
      type: 'local',
      name: '第二目录',
      localPath: 'second',
    });
    setDefaultStorage(connection.db, second.id);
    expect(resolveUploadStorage(connection.db).id).toBe(second.id);
    update(second.id, { enabled: false });
    reopen();
    expect(readStorageSettings(connection.db).defaultStorageId).toBe(second.id);
    expect(() => resolveUploadStorage(connection.db)).toThrowError(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_DISABLED' }),
    );
    expect(resolveUploadStorage(connection.db, originalId).id).toBe(originalId);
    for (const [id, code] of [
      [second.id, 'STORAGE_DISABLED'],
      ['missing', 'STORAGE_NOT_FOUND'],
    ]) {
      expect(() => setDefaultStorage(connection.db, id)).toThrowError(
        expect.objectContaining({ code }),
      );
      expect(readStorageSettings(connection.db).defaultStorageId).toBe(
        second.id,
      );
    }
    setDefaultStorage(connection.db, null);
    reopen();
    expect(readStorageSettings(connection.db).defaultStorageId).toBeNull();
    expect(listStorages(connection.db)).toHaveLength(2);
    expect(() => resolveUploadStorage(connection.db)).toThrowError(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_UNSET' }),
    );
  });

  it('同根目录的两个配置可以写同 Key，读删互不影响', async () => {
    const first = create({
      type: 'local',
      name: '第一配置',
      localPath: 'shared',
    });
    const second = create({
      type: 'local',
      name: '第二配置',
      localPath: 'shared',
    });
    requireLocalStorage(first);
    requireLocalStorage(second);
    const plan = {
      key: 'images/same-key',
      temporaryKey: 'images/same-key.partial',
    };
    await writeObject(storageRoot, first, plan, Readable.from(['first-bytes']));
    await writeObject(
      storageRoot,
      second,
      plan,
      Readable.from(['second-bytes']),
    );
    for (const [config, bytes] of [
      [first, 'first-bytes'],
      [second, 'second-bytes'],
    ] as const) {
      const object = await readObject(
        storageRoot,
        config,
        plan.key,
        'image/png',
      );
      expect(Buffer.concat(await object.stream.toArray()).toString()).toBe(
        bytes,
      );
      expect(
        readFileSync(
          join(storageRoot, 'shared/ariso', config.id, plan.key),
          'utf8',
        ),
      ).toBe(bytes);
    }
    await deleteObject(storageRoot, first, plan.key);
    expect(
      readFileSync(
        join(storageRoot, 'shared/ariso', second.id, plan.key),
        'utf8',
      ),
    ).toBe('second-bytes');
  });

  it('默认变化后同图原始对象和后续衍生对象仍固定在最初配置', () => {
    const initial = resolveUploadStorage(connection.db);
    const accepted = connection.db.transaction((tx) => {
      prepareInitialMedia(tx);
      return acceptOriginal(tx, {
        imageId: randomUUID(),
        storageId: initial.id,
        key: 'images/original',
        originalName: 'image.png',
        visibility: 'private',
        format: 'PNG',
        mime: 'image/png',
        byteSize: 3,
        snapshot: createProcessingSnapshot(tx),
        expectedVersions: ['compressed', 'thumbnail'],
      });
    });
    const second = create({
      type: 'local',
      name: '新默认',
      localPath: 'second',
    });
    setDefaultStorage(connection.db, second.id);
    for (const kind of ['compressed', 'thumbnail'] as const) {
      expect(
        connection.db.transaction((tx) =>
          planDerivedObject(tx, accepted.jobId, kind),
        ).storageId,
      ).toBe(initial.id);
    }
    expect(connection.db.select().from(mediaImages).get()!.storageId).toBe(
      initial.id,
    );
    const objects = connection.db.select().from(mediaObjects).all();
    expect(objects).toHaveLength(5);
    expect(objects.every((object) => object.storageId === initial.id)).toBe(
      true,
    );
    expect(resolveUploadStorage(connection.db).id).toBe(second.id);
  });

  it.each([
    { localPath: 'other' },
    { type: 's3' },
    { endpoint: 'https://other.example.test' },
    { bucket: 'other' },
    { pathPrefix: 'other' },
    { forcePathStyle: false },
  ])('完整引用接入前拒绝位置或类型修改 %j', (patch) => {
    const created = create(s3Input);
    const before = row(created.id);
    expect(() => update(created.id, patch)).toThrow();
    expect(row(created.id)).toEqual(before);
  });
});

it('从旧 schema 升级保留默认、图片对象和上传会话引用，外键仍有效', () => {
  const oldMigrations = join(directory, 'old-migrations');
  cpSync(resolve('drizzle'), oldMigrations, { recursive: true });
  const journalPath = join(oldMigrations, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  journal.entries = journal.entries.filter(
    (entry: { idx: number }) => entry.idx <= 9,
  );
  writeFileSync(journalPath, JSON.stringify(journal));
  const previous = openRuntimeDatabase(join(directory, 'previous.db'));
  try {
    migrateRuntimeDatabase(previous.db, oldMigrations);
    previous.db.$client.exec(`
      INSERT INTO storage_configs (id, name, type, enabled, local_path, created_at, updated_at)
      VALUES ('existing-storage', '原有本地', 'local', 1, 'existing', 1000, 1000);
      INSERT INTO storage_settings (id, default_storage_id) VALUES (1, 'existing-storage');
    `);
    // Freeze the predecessor schema fixture; current settings helpers include
    // watermark_asset_id, which does not exist before migration 0011.
    previous.db.$client.exec(`
      INSERT INTO media_settings (id, compression_enabled, output_format, quality, max_edge,
        jpeg_background, watermark_mode, default_link_version, default_visibility, concurrency, updated_at)
      VALUES (1, 1, 'webp', 82, NULL, '#FFFFFF', 'off', 'compressed', 'public', 1, 1000);
    `);
    const snapshot = {
      compressionEnabled: true,
      outputFormat: 'webp' as const,
      quality: 82,
      maxEdge: null,
      jpegBackground: '#FFFFFF',
      watermarkMode: 'off' as const,
      watermarkText: '',
      watermarkFont: 'chinese' as const,
      watermarkFontSize: 3,
      watermarkColor: '#FFFFFF',
      watermarkStrokeColor: '#000000',
      watermarkStrokeWidth: 0,
      watermarkOpacity: 50,
      watermarkPosition: 'bottom-right' as const,
      watermarkMargin: 2,
      watermarkWidth: 20,
      watermarkAsset: null,
      defaultVisibility: 'public' as const,
    };
    // Freeze media rows too: migration 0016 adds candidate width/height to
    // the current ORM schema, which cannot be used against the predecessor.
    previous.db.$client.exec(`
      INSERT INTO media_images (id, storage_id, original_name, display_name, visibility,
        format, mime, byte_size, processing_status, created_at, updated_at)
      VALUES ('existing-image', 'existing-storage', 'before.png', 'before', 'private',
        'PNG', 'image/png', 3, 'pending', 1000, 1000);
      INSERT INTO media_objects (id, image_id, storage_id, key, purpose, status,
        byte_size, format, mime, created_at, updated_at)
      VALUES ('existing-original', 'existing-image', 'existing-storage', 'images/original',
        'original', 'stored', 3, 'PNG', 'image/png', 1000, 1000);
      INSERT INTO media_versions (image_id, kind, object_id, byte_size, format, mime, created_at)
      VALUES ('existing-image', 'original', 'existing-original', 3, 'PNG', 'image/png', 1000);
    `);
    previous.db.$client
      .prepare(
        `INSERT INTO media_jobs (id, image_id, kind, scope, snapshot,
      expected_versions, status, created_at, updated_at) VALUES (?, ?, 'process', 'all', ?, ?, 'queued', 1000, 1000)`,
      )
      .run(
        'existing-job',
        'existing-image',
        JSON.stringify(snapshot),
        JSON.stringify(['thumbnail']),
      );
    const accepted = { jobId: 'existing-job' };
    const now = new Date(1000);
    previous.db
      .insert(uploadSubmissions)
      .values({
        id: 'existing-submission',
        requestId: 'request',
        requestInput: '{}',
        source: 'web',
        storageId: 'existing-storage',
        visibility: 'private',
        snapshot,
        albumIds: [],
        tagIds: [],
        maxFileBytes: 1024,
        batchSize: 1,
        queueLimit: 1,
        lastActivityAt: now,
        createdAt: now,
      })
      .run();
    // Migration 0017 adds nullable transfer fields absent in this historical schema.
    previous.db.$client.exec(`
      INSERT INTO upload_sessions (id, submission_id, queue_item_id, group_index,
        original_name, declared_size, storage_id, state, candidate_image_id, created_at, updated_at)
      VALUES ('existing-session', 'existing-submission', 'item', 0,
        'pending.png', 3, 'existing-storage', 'queued', 'pending-image', 1000, 1000);
    `);
    const readReferences = () => [
      previous.db.select().from(mediaImages).all(),
      previous.db.$client
        .prepare(
          `SELECT id, image_id, job_id, storage_id, key, purpose,
        status, byte_size, format, mime, error, created_at, updated_at FROM media_objects`,
        )
        .all(),
      previous.db.select().from(uploadSubmissions).all(),
      previous.db.$client
        .prepare(
          `SELECT id, submission_id, queue_item_id, group_index, original_name,
        declared_size, declared_mime, storage_id, state, candidate_image_id,
        temporary_key, final_key, byte_size, image_id, job_id, error_code, error,
        cleanup_status, cleanup_attempts, next_cleanup_at, created_at, updated_at FROM upload_sessions`,
        )
        .all(),
    ];
    const before = readReferences();
    migrateRuntimeDatabase(previous.db, resolve('drizzle'));
    expect(readReferences()).toEqual(before);
    expect(previous.db.select().from(mediaObjects).get()).toMatchObject({
      width: null,
      height: null,
    });
    expect(previous.db.select().from(uploadSessions).get()).toMatchObject({
      candidateJobId: null,
      route: null,
      routeReason: null,
      temporaryPath: null,
      signatureExpiresAt: null,
      sourceEtag: null,
      temporaryBytes: null,
      finalBytes: null,
      confirmedAt: null,
    });
    expect(readStorage(previous.db, 'existing-storage')).toMatchObject({
      name: '原有本地',
      type: 'local',
      localPath: 'existing',
      enabled: true,
      configRevision: 1,
      hasAccessKey: false,
      hasSecretKey: false,
    });
    expect(readStorageSettings(previous.db).defaultStorageId).toBe(
      'existing-storage',
    );
    const addedS3 = createStorage(
      previous.db,
      storageCreateInputSchema.parse(s3Input),
      context(),
    );
    expect(readStorage(previous.db, addedS3.id)).toMatchObject({
      type: 's3',
      localPath: null,
      enabled: false,
      hasAccessKey: true,
      hasSecretKey: true,
    });
    expect(previous.db.$client.pragma('foreign_key_check')).toEqual([]);
    expect(previous.db.$client.pragma('foreign_keys', { simple: true })).toBe(
      1,
    );
    expect(
      previous.db.transaction((tx) =>
        planDerivedObject(tx, accepted.jobId, 'thumbnail'),
      ).storageId,
    ).toBe('existing-storage');
    expect(() => previous.db.delete(storageConfigs).run()).toThrow(
      'FOREIGN KEY',
    );
  } finally {
    previous.close();
  }
});
