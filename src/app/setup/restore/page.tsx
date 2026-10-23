import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { RestorePage } from '../../../components/backup/restore-page';
import { readSetupOwner } from '../../../server/identity/setup';
import { getServerRuntime } from '../../../server/startup/server-start';

export default async function Page() {
  await connection();
  const runtime = getServerRuntime();
  if (readSetupOwner(runtime.connection.db, runtime.setup.databasePath))
    redirect('/login');
  return <RestorePage />;
}
