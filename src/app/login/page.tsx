import { connection } from 'next/server';
import { PublicShell } from '../../components/shell/public-shell';
import { LoginForm } from '../../components/identity/login-form';
import { loginDestination } from '../../components/identity/return-to';
import { readSetupOwner } from '../../server/identity/setup';
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
  const notice =
    query.setup === 'completed'
      ? '初始化已完成，请使用刚才设置的邮箱和密码登录。'
      : query.reason === 'expired'
        ? '会话已失效，请重新登录后继续。'
        : query.reason === 'signed-out'
          ? '已退出登录。'
          : '';
  return (
    <PublicShell>
      <LoginForm
        initialized={initialized}
        returnTo={loginDestination(query.returnTo)}
        notice={notice}
      />
    </PublicShell>
  );
}
