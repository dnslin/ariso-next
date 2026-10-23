import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { Link } from '@heroui/react/link';
import { ArchiveRestore } from 'lucide-react';
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
    <PublicShell layout="setup">
      <div className="grid w-full max-w-[520px] gap-5">
        <SetupForm />
        <div className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
          <p>已有整站备份？可以将图片和配置恢复到这个空白实例。</p>
          <Link
            href="/setup/restore"
            className="min-h-11 w-fit gap-2 text-foreground"
          >
            <ArchiveRestore className="size-4" aria-hidden />
            从备份恢复
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
