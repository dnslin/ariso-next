import type { openRuntimeDatabase } from '../runtime/db.ts';
import { dirname } from 'node:path';
import { listRestoreJobs } from '../backup/jobs.ts';
import { BackupError } from '../backup/errors.ts';
import { hashPassword } from 'better-auth/crypto';
import { and, eq, like } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accountInputSchema } from './validation.ts';
import { account, session, user, verification } from './schema.ts';

export function assertRestoreNotActivating(dataDir: string) {
  if (listRestoreJobs(dataDir).some((job) => job.status === 'activating'))
    throw new BackupError(
      'RESTORE_ACTIVATING',
      409,
      'RESTORE_ACTIVATING: 恢复启用尚未完成，请先完成服务重启后再重置密码',
    );
}

export function readCliCredential(db: BetterSQLite3Database) {
  const owner = db.select({ id: user.id }).from(user).get();
  if (!owner) throw new Error('未初始化，请先完成 setup');
  const credential = db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(
      and(eq(account.userId, owner.id), eq(account.providerId, 'credential')),
    )
    .get();
  if (!credential?.password)
    throw new Error('所有者数据不完整：缺少 credential');
  return { ownerId: owner.id, credentialId: credential.id };
}

export async function resetCliPassword(
  db: ReturnType<typeof openRuntimeDatabase>['db'],
  password: string,
  confirmation: string,
  signal?: AbortSignal,
) {
  const parsed = accountInputSchema.shape.password.safeParse(password);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  signal?.throwIfAborted();
  if (password !== confirmation) throw new Error('两次输入的密码不一致');
  assertRestoreNotActivating(dirname(db.$client.name));
  readCliCredential(db);
  const passwordHash = await hashPassword(password);
  signal?.throwIfAborted();
  db.transaction(
    (tx) => {
      assertRestoreNotActivating(dirname(db.$client.name));
      const { ownerId, credentialId } = readCliCredential(tx);
      tx.update(account)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(account.id, credentialId))
        .run();
      tx.delete(session).where(eq(session.userId, ownerId)).run();
      tx.delete(verification)
        .where(
          and(
            eq(verification.value, ownerId),
            like(verification.identifier, 'reset-password:%'),
          ),
        )
        .run();
    },
    { behavior: 'immediate' },
  );
}
