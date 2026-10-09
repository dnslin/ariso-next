import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { PublicShell } from '../../components/shell/public-shell';
import { ForgotPasswordForm } from '../../components/identity/forgot-password-form';
import { readSetupOwner } from '../../server/identity/setup';
import { readSmtpSettings } from '../../server/identity/mail';
import { getServerRuntime } from '../../server/startup/server-start';

export const metadata = { title: '找回密码 · Ariso', referrer: 'no-referrer' };

export default async function ForgotPasswordPage() {
  await connection();
  const runtime = getServerRuntime();
  if (!readSetupOwner(runtime.connection.db, runtime.setup.databasePath))
    redirect('/setup');
  return (
    <PublicShell layout="recovery">
      <ForgotPasswordForm
        smtpConfigured={!!readSmtpSettings(runtime.connection.db)}
      />
    </PublicShell>
  );
}
