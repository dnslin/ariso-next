import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '../../components/shell/admin-shell';
import { SessionControls } from '../../components/identity/session-controls';
import { requireOwner } from '../../server/identity/owner';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';

export default async function AdminPage() {
  const requestHeaders = await headers();
  let owner;
  try {
    owner = await requireOwner(
      new Request('http://ariso.internal/admin', { headers: requestHeaders }),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'UNAUTHORIZED'
    )
      throw error;
    const hadCookie = /(?:^|;\s*)(?:__Secure-)?ariso\.session_token=/.test(
      requestHeaders.get('cookie') ?? '',
    );
    redirect(`/login?returnTo=%2Fadmin${hadCookie ? '&reason=expired' : ''}`);
  }
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <AdminShell
      name={settings.name}
      description={settings.description}
      navigation={[{ href: '/admin', label: '工作空间' }]}
      user={<span>{owner.email}</span>}
    >
      <section className="grid max-w-xl gap-6">
        <h1>工作空间</h1>
        <p>已使用 {owner.email} 登录。</p>
        <SessionControls returnTo="/admin" />
      </section>
    </AdminShell>
  );
}
