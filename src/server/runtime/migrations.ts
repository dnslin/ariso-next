import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DrizzleError } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { openRuntimeDatabase } from './db.ts';

/** 调用方负责连接生命周期；只检查向前版本，迁移事务由 Drizzle 管理。 */
export function migrateRuntimeDatabase(
  db: ReturnType<typeof openRuntimeDatabase>['db'],
  migrationsFolder: string,
) {
  let stage = 'read-progress';
  let currentMigration: number | null = null;
  let latestMigration: number | null = null;
  let migrationFiles: string[] = [];
  const databasePath = db.$client.name;
  try {
    const hasProgress = db.$client
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
      )
      .get();
    if (hasProgress) {
      const row = db.$client
        .prepare(
          'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
        )
        .get() as { created_at: number } | undefined;
      currentMigration = row ? Number(row.created_at) : null;
    }

    stage = 'read-migrations';
    const migrations = readMigrationFiles({ migrationsFolder });
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string; when: number }[];
    };
    latestMigration =
      migrations.length === 0
        ? null
        : Math.max(...migrations.map((migration) => migration.folderMillis));
    migrationFiles = journal.entries
      .filter(
        (entry) => currentMigration === null || entry.when > currentMigration,
      )
      .map((entry) => join(migrationsFolder, `${entry.tag}.sql`));

    stage = 'check-version';
    if (
      currentMigration !== null &&
      (latestMigration === null || currentMigration > latestMigration)
    ) {
      throw new Error(
        '数据库比当前迁移集合更新；请恢复升级前的数据备份后再运行旧镜像。',
      );
    }

    stage = 'apply';
    migrate(db, { migrationsFolder });
  } catch (error) {
    // DrizzleError 的 message 包含完整 SQL；保留底层原因，避免复制 SQL/参数到诊断。
    const cause = error instanceof DrizzleError ? error.cause : error;
    const code =
      stage === 'check-version' ? 'SCHEMA_TOO_NEW' : 'MIGRATION_FAILED';
    throw Object.assign(
      new Error(
        `${code}: ${stage}; database=${databasePath}; current=${currentMigration}; latest=${latestMigration}; ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      ),
      {
        code,
        stage,
        databasePath,
        migrationsFolder,
        currentMigration,
        latestMigration,
        migrationFiles,
      },
    );
  }
}
