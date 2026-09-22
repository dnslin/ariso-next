import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { readSiteSettings, type SiteTransaction } from '../site/settings.ts';
import { account, user } from './schema.ts';

export class SetupError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function incompleteIdentity(databasePath: string, missing: string) {
  return new SetupError(
    'IDENTITY_INCOMPLETE',
    500,
    `所有者数据不完整：缺少或无效的 ${missing}；数据库：${databasePath}`,
  );
}

/** 无所有者是正常状态；已有所有者不能因必需记录损坏而重新开放 setup。 */
export function readSetupOwner(
  db: BetterSQLite3Database,
  databasePath: string,
) {
  const owner = db.select({ id: user.id }).from(user).get();
  if (!owner) return null;
  const siteSettings = readSiteSettings(db);
  if (!siteSettings) throw incompleteIdentity(databasePath, 'site_settings');
  const credential = db
    .select()
    .from(account)
    .where(
      and(eq(account.userId, owner.id), eq(account.providerId, 'credential')),
    )
    .get();
  if (!credential?.password || credential.accountId !== owner.id)
    throw incompleteIdentity(databasePath, 'credential');
  return { owner, siteSettings };
}

export function createSetupState(
  db: BetterSQLite3Database,
  databasePath: string,
) {
  return {
    databasePath,
    code: readSetupOwner(db, databasePath)
      ? null
      : randomBytes(24).toString('base64url'),
  };
}

export type SetupState = ReturnType<typeof createSetupState>;

export function requireSetupOpen(
  db: BetterSQLite3Database,
  databasePath: string,
) {
  if (readSetupOwner(db, databasePath))
    throw new SetupError(
      'SETUP_ALREADY_COMPLETED',
      409,
      '初始化已完成，请登录',
    );
}

/** 哈希前与同步事务内各检查一次；事务内检查也使旧的并发提交失效。 */
export function verifySetupCode(
  db: BetterSQLite3Database,
  state: SetupState,
  code: string,
) {
  requireSetupOpen(db, state.databasePath);
  if (!state.code || state.code !== code)
    throw new SetupError(
      'INVALID_SETUP_CODE',
      401,
      '初始化码无效，请查看当前启动日志',
    );
}

export function insertSetupOwner(
  tx: SiteTransaction,
  email: string,
  passwordHash: string,
) {
  const id = randomUUID();
  tx.insert(user)
    .values({ id, name: 'Owner', email, emailVerified: false })
    .run();
  tx.insert(account)
    .values({
      id: randomUUID(),
      accountId: id,
      userId: id,
      providerId: 'credential',
      password: passwordHash,
      updatedAt: new Date(),
    })
    .run();
}
