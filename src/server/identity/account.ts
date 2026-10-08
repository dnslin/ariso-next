import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { isAPIError } from 'better-auth/api';
import { and, eq, like, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { z } from 'zod';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { requireOwnerSession } from './owner.ts';
import { account, session, user, verification } from './schema.ts';
import type {
  accountEmailInputSchema,
  accountPasswordInputSchema,
} from './validation.ts';
import { AccountError } from './errors.ts';

type OwnerSession = Awaited<ReturnType<typeof requireOwnerSession>>;

function readCredential(db: BetterSQLite3Database, ownerId: string) {
  const credential = db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(
      and(eq(account.userId, ownerId), eq(account.providerId, 'credential')),
    )
    .get();
  if (!credential?.password)
    throw new AccountError(
      'IDENTITY_INCOMPLETE',
      500,
      '所有者数据不完整：缺少或无效的 credential',
    );
  return { id: credential.id, password: credential.password };
}

async function checkPassword(hash: string, password: string) {
  if (!(await verifyPassword({ hash, password })))
    throw new AccountError('INVALID_PASSWORD', 400, '当前密码不正确', [
      { field: 'currentPassword', message: '当前密码不正确' },
    ]);
}

function requireUnchangedCredential(
  db: BetterSQLite3Database,
  ownerId: string,
  original: ReturnType<typeof readCredential>,
) {
  const current = readCredential(db, ownerId);
  if (current.id !== original.id || current.password !== original.password)
    throw new AccountError(
      'ACCOUNT_PASSWORD_CHANGED',
      409,
      '核对期间密码已发生变化，请使用当前密码重试',
    );
}

function requireActiveSession(db: BetterSQLite3Database, owner: OwnerSession) {
  const active = db
    .select({ expiresAt: session.expiresAt })
    .from(session)
    .where(
      and(eq(session.id, owner.session.id), eq(session.userId, owner.user.id)),
    )
    .get();
  if (!active || active.expiresAt <= new Date())
    throw new AccountError('UNAUTHORIZED', 401, '会话已失效，请重新登录');
}

export async function updateOwnerEmail(
  db: BetterSQLite3Database,
  owner: OwnerSession,
  input: z.infer<typeof accountEmailInputSchema>,
) {
  const credential = readCredential(db, owner.user.id);
  await checkPassword(credential.password, input.currentPassword);
  db.transaction(
    (tx) => {
      requireUnchangedCredential(tx, owner.user.id, credential);
      requireActiveSession(tx, owner);
      tx.update(user)
        .set({
          email: input.email,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(user.id, owner.user.id))
        .run();
      // Better Auth 1.7.5 uses identifier=reset-password:<token> and value=user ID.
      tx.delete(verification)
        .where(
          and(
            eq(verification.value, owner.user.id),
            like(verification.identifier, 'reset-password:%'),
          ),
        )
        .run();
    },
    { behavior: 'immediate' },
  );
  return { code: 'ACCOUNT_EMAIL_UPDATED', email: input.email };
}

export async function updateOwnerPassword(
  db: BetterSQLite3Database,
  owner: OwnerSession,
  input: z.infer<typeof accountPasswordInputSchema>,
) {
  const credential = readCredential(db, owner.user.id);
  await checkPassword(credential.password, input.currentPassword);
  const passwordHash = await hashPassword(input.newPassword);
  // Native changePassword writes then replaces every session without one transaction.
  // Use the library crypto primitives and keep the authenticated current session.
  db.transaction(
    (tx) => {
      requireUnchangedCredential(tx, owner.user.id, credential);
      requireActiveSession(tx, owner);
      tx.update(account)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(account.id, credential.id))
        .run();
      tx.delete(session)
        .where(
          and(
            eq(session.userId, owner.user.id),
            ne(session.id, owner.session.id),
          ),
        )
        .run();
    },
    { behavior: 'immediate' },
  );
  return { code: 'ACCOUNT_PASSWORD_UPDATED' };
}

export async function readAccountInput<T>(
  request: Request,
  schema: z.ZodType<T>,
  inputName = '账号信息',
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new AccountError(
      'INVALID_ACCOUNT_INPUT',
      400,
      `请提交 JSON ${inputName}`,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new AccountError(
      'INVALID_ACCOUNT_INPUT',
      400,
      `请检查${inputName}`,
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  return parsed.data;
}

export async function accountResponse(
  request: Request,
  operation: (
    runtime: ReturnType<typeof getServerRuntime>,
    owner: OwnerSession,
  ) => unknown | Promise<unknown>,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const owner = await requireOwnerSession(request);
    const result = await operation(getServerRuntime(), owner);
    if (result instanceof Response) {
      result.headers.set('Cache-Control', 'no-store');
      return result;
    }
    return Response.json(result, { headers });
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500) {
      const messages: Record<string, string> = {
        PROVIDER_NOT_FOUND: 'GitHub 登录尚未生效，请检查配置并重启容器',
        SESSION_NOT_FRESH: '请重新登录后解绑 GitHub',
        UNAUTHORIZED: '会话已失效，请重新登录',
        ACCOUNT_NOT_FOUND: 'GitHub 绑定不存在，请刷新账号信息',
      };
      const nativeHeaders = new Headers(error.headers);
      nativeHeaders.set('Cache-Control', 'no-store');
      return Response.json(
        {
          code: error.body?.code,
          message:
            messages[error.body?.code ?? ''] ??
            'GitHub 操作未完成，请核对绑定现状',
        },
        { status: error.statusCode, headers: nativeHeaders },
      );
    }
    const detail = error as { status?: number; code?: string };
    if (
      typeof detail?.status === 'number' &&
      detail.status < 500 &&
      typeof detail.code === 'string' &&
      error instanceof Error
    )
      return Response.json(
        {
          code: detail.code,
          message: error.message,
          ...(error instanceof AccountError && error.fields
            ? { fields: error.fields }
            : {}),
        },
        { status: detail.status, headers },
      );
    // Drizzle errors may include password hashes in query parameters.
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error;
    const runtime = getServerRuntime();
    createRuntimeLogger('identity.account', runtime.config.logLevel).error(
      { err: cause, databasePath: runtime.connection.db.$client.name },
      'Account request failed',
    );
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '账号服务异常，请稍后重试' },
      { status: 500, headers },
    );
  }
}
