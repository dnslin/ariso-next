import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { PublicShell } from '../../components/shell/public-shell';
import { ResetPasswordForm } from '../../components/identity/reset-password-form';
import { getAuth } from '../../server/identity/auth';
import { readSetupOwner } from '../../server/identity/setup';
import { getServerRuntime } from '../../server/startup/server-start';

export const metadata = { title: '重置密码 · Ariso', referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const runtime = getServerRuntime();
  const owner = readSetupOwner(
    runtime.connection.db,
    runtime.setup.databasePath,
  );
  if (!owner) redirect('/setup');
  const query = await searchParams;
  const token =
    typeof query.token === 'string' && !query.error ? query.token : '';
  const context = await getAuth(runtime)!.$context;
  const verification = token
    ? await context.internalAdapter.findVerificationValue(
        `reset-password:${token}`,
      )
    : null;
  const valid = !!verification && verification.expiresAt >= new Date();
  return (
    <PublicShell layout="setup">
      <div className="grid w-full max-w-[480px] min-w-0 gap-7">
        <header className="grid min-w-0 justify-items-center gap-1.5 text-center">
          <p className="max-w-full font-['Caveat'] text-[56px] leading-[71px] wrap-anywhere">
            {owner.siteSettings.name}
          </p>
          <p className="text-muted text-sm leading-[17px]">找回你的图片空间</p>
        </header>
        <ResetPasswordForm
          key={token}
          token={valid ? token : ''}
          valid={valid}
        />
      </div>
    </PublicShell>
  );
}
