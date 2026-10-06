import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { AccountError } from './errors.ts';
import type { getAuth } from './auth.ts';
import { account } from './schema.ts';

function githubAccount(db: BetterSQLite3Database, ownerId: string) {
  return db
    .select({
      id: account.id,
      accountId: account.accountId,
      login: account.githubLogin,
    })
    .from(account)
    .where(and(eq(account.userId, ownerId), eq(account.providerId, 'github')))
    .get();
}

export function readGithubBinding(db: BetterSQLite3Database, ownerId: string) {
  const linked = githubAccount(db, ownerId);
  return {
    binding: linked
      ? { accountId: linked.accountId, login: linked.login }
      : null,
  };
}

export async function linkGithubAccount(
  db: BetterSQLite3Database,
  ownerId: string,
  auth: NonNullable<ReturnType<typeof getAuth>>,
  request: Request,
) {
  if (githubAccount(db, ownerId))
    throw new AccountError(
      'GITHUB_ALREADY_LINKED',
      409,
      '已绑定 GitHub 账号，请先解绑再更换',
    );
  const origin = auth.options.baseURL as string;
  const result = await auth.api.linkSocialAccount({
    headers: request.headers,
    body: {
      provider: 'github',
      callbackURL: `${origin}/settings/account?github=linked`,
      errorCallbackURL: `${origin}/settings/account?github=error`,
      disableRedirect: true,
    },
    returnHeaders: true,
  });
  return Response.json(result.response, { headers: result.headers });
}

export async function unlinkGithubAccount(
  db: BetterSQLite3Database,
  ownerId: string,
  auth: NonNullable<ReturnType<typeof getAuth>>,
  request: Request,
) {
  const linked = githubAccount(db, ownerId);
  if (!linked)
    throw new AccountError(
      'GITHUB_ACCOUNT_NOT_FOUND',
      404,
      'GitHub 绑定不存在，请刷新账号信息',
    );
  const result = await auth.api.unlinkAccount({
    headers: request.headers,
    body: { accountId: linked.id },
    returnHeaders: true,
  });
  return Response.json(readGithubBinding(db, ownerId), {
    headers: result.headers,
  });
}
