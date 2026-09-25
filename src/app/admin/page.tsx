import { AdminShell } from '../../components/shell/admin-shell';
import { SessionControls } from '../../components/identity/session-controls';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';

export default async function AdminPage() {
  const owner = await requirePageOwner('/admin');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <AdminShell
      name={settings.name}
      description={settings.description}
      navigation={[
        { href: '/admin', label: '工作空间' },
        { href: '/library', label: '图库' },
      ]}
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
