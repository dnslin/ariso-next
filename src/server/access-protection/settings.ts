import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accessProtectionSettings } from './schema.ts';
import type { AccessProtectionInput } from './types.ts';

function missingSettings() {
  return new Error('访问防护设置缺失，请检查数据库迁移');
}

export function requireAccessProtectionSettings(db: BetterSQLite3Database) {
  const settings = db
    .select()
    .from(accessProtectionSettings)
    .where(eq(accessProtectionSettings.id, 1))
    .get();
  if (!settings) throw missingSettings();
  return settings;
}

/** The HTTP boundary validates the complete input; one UPDATE is atomic. */
export function updateAccessProtectionSettings(
  db: BetterSQLite3Database,
  input: AccessProtectionInput,
) {
  const settings = db
    .update(accessProtectionSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(accessProtectionSettings.id, 1))
    .returning()
    .get();
  if (!settings) throw missingSettings();
  return settings;
}
