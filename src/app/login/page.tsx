import { connection } from 'next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PublicShell } from '../../components/shell/public-shell';
import { LoginForm } from '../../components/identity/login-form';
import { loginDestination } from '../../components/identity/return-to';
import { readSetupOwner } from '../../server/identity/setup';
import { readOptionalOwner } from '../../server/identity/owner';
import { getServerRuntime } from '../../server/startup/server-start';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const runtime = getServerRuntime();
  const initialized = !!readSetupOwner(
    runtime.connection.db,
    runtime.setup.databasePath,
  );
  const query = await searchParams;
  const returnTo = loginDestination(query.returnTo);
  if (
    initialized &&
    (await readOptionalOwner(
      new Request('http://ariso.internal/login', { headers: await headers() }),
    ))
  )
    redirect(returnTo);
  const notice = !initialized
    ? ''
    : query.setup === 'completed'
      ? '初始化已完成，请使用刚才设置的邮箱和密码登录。'
      : query.github === 'error'
        ? 'GitHub 登录未完成。仅已主动绑定的账号可登录，请重试或使用邮箱和密码。'
        : query.reason === 'expired'
          ? '会话已失效，请重新登录后继续。'
          : query.reason === 'signed-out'
            ? '已退出登录。'
            : '';
  return (
    <PublicShell layout="login">
      <LoginForm
        initialized={initialized}
        returnTo={returnTo}
        notice={notice}
        githubEnabled={runtime.github.enabled}
      />
    </PublicShell>
  );
}
