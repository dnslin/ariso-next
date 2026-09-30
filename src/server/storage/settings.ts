import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import { prepareLocalDirectory } from './local.ts';
import {
  storageConfigs,
  storageSettings,
  type StorageConfig,
} from './schema.ts';
import type { StorageCreateInput, StorageUpdateInput } from './validation.ts';

type SecretCrypto = ReturnType<typeof createSecretCrypto>;
export type StorageContext = {
  storageRoot: string;
  secretCrypto: SecretCrypto;
};
function storageError(code: string, message: string, storageId?: string) {
  return Object.assign(new Error(message), { code, storageId });
}
function requireStorage(db: BetterSQLite3Database, id: string) {
  const config = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, id))
    .get();
  if (!config) throw storageError('STORAGE_NOT_FOUND', `存储不存在: ${id}`, id);
  return config;
}
function redact(config: StorageConfig) {
  const { accessKeyEncrypted, secretKeyEncrypted, ...safe } = config;
  return {
    ...safe,
    hasAccessKey: accessKeyEncrypted !== null,
    hasSecretKey: secretKeyEncrypted !== null,
  };
}
export function readStorage(db: BetterSQLite3Database, id: string) {
  return redact(requireStorage(db, id));
}
export function listStorages(db: BetterSQLite3Database) {
  return db
    .select()
    .from(storageConfigs)
    .orderBy(asc(storageConfigs.createdAt), asc(storageConfigs.id))
    .all()
    .map(redact);
}
export function readStorageSettings(db: BetterSQLite3Database) {
  const settings = db.select().from(storageSettings).get();
  if (!settings)
    throw storageError('STORAGE_NOT_INITIALIZED', '存储尚未初始化');
  return settings;
}
export function createStorage(
  db: BetterSQLite3Database,
  input: StorageCreateInput,
  context: StorageContext,
) {
  if (input.type === 'local')
    prepareLocalDirectory(context.storageRoot, input.localPath);
  const now = new Date();
  const values =
    input.type === 'local'
      ? { type: input.type, localPath: input.localPath, enabled: input.enabled }
      : {
          type: input.type,
          enabled: false,
          endpoint: input.endpoint,
          region: input.region,
          bucket: input.bucket,
          pathPrefix: input.pathPrefix,
          forcePathStyle: input.forcePathStyle,
          accessKeyEncrypted:
            input.accessKey == null
              ? null
              : context.secretCrypto.encryptSecret(input.accessKey),
          secretKeyEncrypted:
            input.secretKey == null
              ? null
              : context.secretCrypto.encryptSecret(input.secretKey),
        };
  return redact(
    db
      .insert(storageConfigs)
      .values({
        id: randomUUID(),
        name: input.name,
        ...values,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get(),
  );
}
/** Only name, enabled and secrets are writable until T-STO-06 supplies complete references. */
export function updateStorage(
  db: BetterSQLite3Database,
  id: string,
  input: StorageUpdateInput,
  context: StorageContext,
) {
  return db.transaction((tx) => {
    const config = requireStorage(tx, id);
    if (
      config.type === 'local' &&
      (input.accessKey !== undefined || input.secretKey !== undefined)
    )
      throw storageError('STORAGE_INVALID_INPUT', '本地存储不接受 S3 凭据', id);
    const values: Partial<typeof storageConfigs.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) values.name = input.name;
    let changed = false;
    for (const [field, column] of [
      ['accessKey', 'accessKeyEncrypted'],
      ['secretKey', 'secretKeyEncrypted'],
    ] as const) {
      const value = input[field];
      if (value === undefined) continue;
      const previous = config[column];
      if (
        value === null
          ? previous === null
          : previous !== null &&
            context.secretCrypto.decryptSecret(
              previous,
              `storage ${id} ${field}`,
            ) === value
      )
        continue;
      values[column] =
        value === null ? null : context.secretCrypto.encryptSecret(value);
      changed = true;
    }
    if (changed)
      Object.assign(values, {
        configRevision: config.configRevision + 1,
        enabled: false,
        connectionStatus: 'untested',
        connectionRevision: null,
        connectionTestedAt: null,
        connectionReport: null,
        corsStatus: 'invalidated',
        corsReport: null,
        corsRevision: null,
        corsOrigin: null,
        corsTestedAt: null,
      });
    if (input.enabled === true) {
      if (
        config.type === 's3' &&
        (changed ||
          !config.accessKeyEncrypted ||
          !config.secretKeyEncrypted ||
          config.connectionStatus !== 'passed' ||
          config.connectionRevision !== config.configRevision)
      )
        throw storageError(
          'STORAGE_TEST_REQUIRED',
          'S3 当前配置须具备完整凭据并通过连接测试后才能启用',
          id,
        );
      if (config.type === 'local') {
        requireLocalStorage(config);
        prepareLocalDirectory(context.storageRoot, config.localPath);
      }
      values.enabled = true;
    } else if (input.enabled === false) values.enabled = false;
    return redact(
      tx
        .update(storageConfigs)
        .set(values)
        .where(eq(storageConfigs.id, id))
        .returning()
        .get(),
    );
  });
}
export function setDefaultStorage(
  db: BetterSQLite3Database,
  id: string | null,
) {
  return db.transaction((tx) => {
    readStorageSettings(tx);
    if (id !== null) {
      const config = requireStorage(tx, id);
      if (!config.enabled)
        throw storageError('STORAGE_DISABLED', `存储已停用: ${id}`, id);
    }
    return tx
      .update(storageSettings)
      .set({ defaultStorageId: id })
      .where(eq(storageSettings.id, 1))
      .returning()
      .get();
  });
}
export function verifyStorageSecrets(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
) {
  for (const config of db.select().from(storageConfigs).all()) {
    for (const field of ['accessKeyEncrypted', 'secretKeyEncrypted'] as const) {
      const value = config[field];
      if (value !== null)
        crypto.decryptSecret(value, `storage ${config.id} ${field}`);
    }
  }
}
/** Current local-only callers must reject S3 before registering work or touching disk. */
export function requireLocalStorage<
  T extends { id: string; type: string; localPath: string | null },
>(config: T): asserts config is T & { type: 'local'; localPath: string } {
  if (config.type !== 'local' || config.localPath === null)
    throw storageError(
      'STORAGE_TYPE_UNSUPPORTED',
      '此业务入口尚未支持 S3 存储',
      config.id,
    );
}
