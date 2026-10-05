import { createHash, randomBytes } from 'node:crypto';
import { verifyPassword } from 'better-auth/crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import { SharingError } from './errors.ts';
import { albumShares, shareGrants } from './schema.ts';
import type { createShareLimiter } from './limiter.ts';

type Transaction = Parameters<
  Parameters<BetterSQLite3Database['transaction']>[0]
>[0];
type Share = typeof albumShares.$inferSelect;
export const shareGrantLifetime = 24 * 60 * 60 * 1000;
export const shareGrantCookie = 'ariso_share_grant';
export const digestGrantSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');

function availability(share: Share | undefined, now: Date): 404 | 410 | null {
  if (!share) return 404;
  if (!share.enabled || (share.expiresAt !== null && now >= share.expiresAt))
    return 410;
  return null;
}

/** Compose this check and anonymous member reads inside the same synchronous transaction. */
export function readShareAccess(
  tx: Transaction,
  input: { token: string; grantSecret?: string; now: Date },
) {
  const share = tx
    .select()
    .from(albumShares)
    .where(eq(albumShares.token, input.token))
    .get();
  const unavailable = availability(share, input.now);
  if (unavailable) return { allowed: false as const, status: unavailable };
  if (share!.passwordHash !== null) {
    const grant =
      input.grantSecret &&
      tx
        .select({ shareId: shareGrants.shareId })
        .from(shareGrants)
        .where(
          and(
            eq(shareGrants.shareId, share!.id),
            eq(
              shareGrants.grantSecretHash,
              digestGrantSecret(input.grantSecret),
            ),
            eq(shareGrants.authRevision, share!.authRevision),
            gt(shareGrants.expiresAt, input.now),
          ),
        )
        .get();
    if (!grant) return { allowed: false as const, status: 401 as const };
  }
  return { allowed: true as const, share: share! };
}

function unavailableError(status: 404 | 410) {
  return new SharingError(
    status === 404 ? 'SHARING_NOT_FOUND' : 'SHARING_UNAVAILABLE',
    '分享不存在或已失效',
    status,
  );
}

/** Hashing is outside SQLite; a fresh transaction owns the decision and grant write. */
export async function unlockShare(
  context: {
    db: BetterSQLite3Database;
    limiter: ReturnType<typeof createShareLimiter>;
    logger: Pick<Logger, 'info' | 'error' | 'debug'>;
    now: () => Date;
  },
  token: string,
  password: string,
) {
  const started = performance.now();
  let shareId: string | undefined;
  try {
    const initial = context.db
      .select()
      .from(albumShares)
      .where(eq(albumShares.token, token))
      .get();
    shareId = initial?.id;
    const status = availability(initial, context.now());
    if (status) throw unavailableError(status);
    if (initial!.passwordHash === null) return { expiresAt: null };
    const release = context.limiter.acquire(
      initial!.id,
      context.now().getTime(),
    );
    try {
      context.logger.debug(
        { shareId, result: 'started' },
        'Share password verification started',
      );
      const verified = await verifyPassword({
        hash: initial!.passwordHash!,
        password,
      });
      const result = context.db.transaction(
        (tx) => {
          const now = context.now();
          const current = tx
            .select()
            .from(albumShares)
            .where(eq(albumShares.token, token))
            .get();
          const unavailable = availability(current, now);
          if (unavailable) throw unavailableError(unavailable);
          if (
            current!.id !== initial!.id ||
            current!.authRevision !== initial!.authRevision ||
            current!.passwordHash !== initial!.passwordHash
          )
            throw new SharingError(
              'SHARING_CHANGED',
              '分享设置已改变，请重新验证',
              409,
            );
          if (!verified)
            throw new SharingError(
              'SHARING_PASSWORD_INVALID',
              '密码错误，请重试',
              401,
            );
          const grantSecret = randomBytes(32).toString('base64url');
          const expiresAt = new Date(now.getTime() + shareGrantLifetime);
          tx.insert(shareGrants)
            .values({
              shareId: current!.id,
              grantSecretHash: digestGrantSecret(grantSecret),
              authRevision: current!.authRevision,
              verifiedAt: now,
              expiresAt,
            })
            .run();
          return { grantSecret, expiresAt };
        },
        { behavior: 'immediate' },
      );
      context.logger.info(
        {
          shareId,
          result: 'verified',
          elapsedMs: Math.round(performance.now() - started),
        },
        'Share password verification finished',
      );
      return result;
    } finally {
      release();
    }
  } catch (err) {
    const fields = {
      shareId,
      result: err instanceof Error && 'code' in err ? err.code : 'error',
      elapsedMs: Math.round(performance.now() - started),
    };
    if (err instanceof Error && 'status' in err)
      context.logger.info(fields, 'Share password verification finished');
    else
      context.logger.error(
        { ...fields, err },
        'Share password verification failed',
      );
    throw err;
  }
}
