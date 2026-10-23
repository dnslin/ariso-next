import { existsSync, readdirSync } from 'node:fs';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import { BackupError } from './errors.ts';

// DATA_DIR paths are resolved by Node at runtime, outside Next's build asset graph.
const { join } = process.getBuiltinModule('node:path');

// DATA_DIR is mounted runtime data; its files are discovered when checking the new instance.
export function hasFiles(path: string): boolean {
  if (!existsSync(path)) return false;
  return readdirSync(path, {
    withFileTypes: true,
  }).some((entry) => !entry.isDirectory() || hasFiles(join(path, entry.name)));
}
const emptyConfigurationTables = new Set([
  '__drizzle_migrations',
  'sqlite_sequence',
  'storage_configs',
  'storage_settings',
  'storage_scans',
  'media_settings',
  'upload_settings',
  'site_settings',
  'identity_github_settings',
  'identity_smtp_settings',
]);
export function assertEmptyRestoreTarget(options: {
  db: ReturnType<typeof openRuntimeDatabase>['db'];
  dataDir: string;
}) {
  for (const table of options.db.$client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[]) {
    if (emptyConfigurationTables.has(table.name)) continue;
    const identifier = `"${table.name.replaceAll('"', '""')}"`;
    if (options.db.$client.prepare(`SELECT 1 FROM ${identifier} LIMIT 1`).get())
      throw new BackupError(
        'RESTORE_TARGET_NOT_EMPTY',
        409,
        `新实例已有业务数据，不能恢复覆盖: ${table.name}`,
      );
  }
  for (const directory of ['storage', 'assets'])
    if (hasFiles(join(options.dataDir, directory)))
      throw new BackupError(
        'RESTORE_TARGET_NOT_EMPTY',
        409,
        `新实例目录非空，不能恢复覆盖: ${join(options.dataDir, directory)}`,
      );
}
