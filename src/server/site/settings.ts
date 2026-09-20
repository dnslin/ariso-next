import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { siteSettings } from './schema.ts';
import type { SiteSettingsInput } from './validation.ts';

type SiteDatabase = BetterSQLite3Database;
export type SiteTransaction = Parameters<
  Parameters<SiteDatabase['transaction']>[0]
>[0];

export function readSiteSettings(db: SiteDatabase) {
  return (
    db.select().from(siteSettings).where(eq(siteSettings.id, 1)).get() ?? null
  );
}

export function requireSiteSettings(db: SiteDatabase) {
  const settings = readSiteSettings(db);
  if (!settings) {
    throw Object.assign(new Error('站点尚未初始化'), {
      code: 'SITE_NOT_INITIALIZED',
    });
  }
  return settings;
}

/** 入口先用 siteSettingsInputSchema 校验；初始化组合方持有同步事务。 */
export function initializeSiteSettings(
  tx: SiteTransaction,
  input: SiteSettingsInput,
) {
  return tx
    .insert(siteSettings)
    .values({
      publicUrl: input.publicUrl,
      timeZone: input.timeZone,
      updatedAt: new Date(),
    })
    .returning()
    .get();
}

/** 仅写本模块字段；地址更新的 CORS 失效由入口在同一事务内组合。 */
export function updateSiteSettings(
  tx: SiteTransaction,
  input: SiteSettingsInput,
) {
  const settings = tx
    .update(siteSettings)
    .set({
      publicUrl: input.publicUrl,
      timeZone: input.timeZone,
      updatedAt: new Date(),
    })
    .where(eq(siteSettings.id, 1))
    .returning()
    .get();
  if (!settings) {
    throw Object.assign(new Error('站点尚未初始化'), {
      code: 'SITE_NOT_INITIALIZED',
    });
  }
  return settings;
}
