import { OwnerShell } from '../../components/shell/owner-shell';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';

export default async function AdminPage() {
  const owner = await requirePageOwner('/admin');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <OwnerShell
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
    >
      <section className="grid max-w-xl gap-6">
        <h1>工作空间</h1>
        <p>已使用 {owner.email} 登录。</p>
      </section>
    </OwnerShell>
  );
}
