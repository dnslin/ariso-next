import type Database from 'better-sqlite3';
import { z } from 'zod';
import { createSecretCrypto } from '../runtime/crypto.ts';
import { publicUrlSchema } from '../site/validation.ts';
import type { RestoredRemoteConfiguration } from './restore-remote-types.ts';
import { BackupError } from './errors.ts';

export const backupSecretsSchema = z.strictObject({
  originalEncryptionKey: z.string().regex(/^[0-9a-fA-F]{64}$/),
});
const encryptedFields = [
  { table: 'storage_configs', column: 'access_key_encrypted' },
  { table: 'storage_configs', column: 'secret_key_encrypted' },
  { table: 'identity_github_settings', column: 'client_secret_encrypted' },
  { table: 'identity_smtp_settings', column: 'password_encrypted' },
] as const;

/** New instance keys remain the deployment authority; only saved configuration is translated. */
export function convertRestoredConfiguration(options: {
  db: Database.Database;
  originalEncryptionKey: string;
  encryptionKey: Uint8Array;
  publicUrl: string;
  targets?: RestoredRemoteConfiguration[];
}) {
  const origin = publicUrlSchema.parse(options.publicUrl);
  const oldCrypto = createSecretCrypto(
    Buffer.from(options.originalEncryptionKey, 'hex'),
  );
  const newCrypto = createSecretCrypto(Buffer.from(options.encryptionKey));
  options.db.transaction(() => {
    for (const { table, column } of encryptedFields.filter(
      (field) => field.table !== 'storage_configs',
    )) {
      const rows = options.db
        .prepare(
          `SELECT id, ${column} AS secret FROM ${table} WHERE ${column} IS NOT NULL`,
        )
        .all() as Array<{ id: number | string; secret: string }>;
      for (const row of rows) {
        const plaintext = oldCrypto.decryptSecret(
          row.secret,
          `${table}/${row.id}/${column}`,
        );
        options.db
          .prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`)
          .run(newCrypto.encryptSecret(plaintext), row.id);
      }
    }
    const targets = new Map(
      (options.targets ?? []).map((target) => [target.storageId, target]),
    );
    const sources = options.db
      .prepare("SELECT id FROM storage_configs WHERE type='s3'")
      .all() as { id: string }[];
    for (const source of sources) {
      const target = targets.get(source.id);
      if (!target)
        throw new BackupError(
          'RESTORE_TARGET_REQUIRED',
          409,
          `请先配置并测试 S3 存储: ${source.id}`,
        );
      options.db
        .prepare(
          `UPDATE storage_configs SET endpoint=?,region=?,bucket=?,path_prefix=?,force_path_style=?,access_key_encrypted=?,secret_key_encrypted=?,config_revision=?,connection_status='passed',connection_revision=?,connection_report=?,connection_tested_at=?,cors_status='untested',cors_revision=NULL,cors_report=NULL,cors_origin=NULL,cors_tested_at=NULL,updated_at=? WHERE id=?`,
        )
        .run(
          target.endpoint,
          target.region,
          target.bucket,
          target.pathPrefix,
          Number(target.forcePathStyle),
          target.accessKeyEncrypted,
          target.secretKeyEncrypted,
          target.revision,
          target.revision,
          JSON.stringify(target.connectionReport),
          target.testedAt,
          Date.now(),
          source.id,
        );
    }
    options.db
      .prepare('UPDATE site_settings SET public_url=?,updated_at=? WHERE id=1')
      .run(origin, Date.now());
  })();
  verifyRestoredConfiguration(options.db, options.encryptionKey);
}
export function verifyRestoredConfiguration(
  db: Database.Database,
  encryptionKey: Uint8Array,
) {
  const crypto = createSecretCrypto(Buffer.from(encryptionKey));
  for (const { table, column } of encryptedFields) {
    const rows = db
      .prepare(
        `SELECT id, ${column} AS secret FROM ${table} WHERE ${column} IS NOT NULL`,
      )
      .iterate() as Iterable<{ id: number | string; secret: string }>;
    for (const row of rows)
      crypto.decryptSecret(row.secret, `${table}/${row.id}/${column}`);
  }
}
