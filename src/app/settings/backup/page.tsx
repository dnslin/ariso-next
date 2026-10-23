import { BackupPage } from '../../../components/backup/backup-page';
import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { brandingUrl } from '../../../server/site/urls';
import { getServerRuntime } from '../../../server/startup/server-start';

export default async function Page() {
  const owner = await requirePageOwner('/settings/backup');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <BackupPage
      name={settings.name}
      logoUrl={brandingUrl(settings.logoKey)}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      timeZone={settings.timeZone}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
