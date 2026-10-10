import { readSidebarCollapsed } from '../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { brandingUrl } from '../../server/site/urls';
import { getServerRuntime } from '../../server/startup/server-start';
import { SharesScreen } from './list-screen';

export default async function SharesPage() {
  const owner = await requirePageOwner('/shares');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <SharesScreen
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
