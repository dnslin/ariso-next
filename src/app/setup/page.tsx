import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { PublicShell } from '../../components/shell/public-shell';
import { SetupForm } from '../../components/identity/setup-form';
import { readSetupOwner } from '../../server/identity/setup';
import { getServerRuntime } from '../../server/startup/server-start';

export default async function SetupPage() {
  await connection();
  const runtime = getServerRuntime();
  if (readSetupOwner(runtime.connection.db, runtime.setup.databasePath))
    redirect('/login');
  return (
    <PublicShell>
      <SetupForm />
    </PublicShell>
  );
}
