import { TokensPage } from '../../../components/identity/tokens-page';
import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { getServerRuntime } from '../../../server/startup/server-start';

export default async function Page() {
  const owner = await requirePageOwner('/settings/api');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <TokensPage
      name={settings.name}
      description={settings.description}
      timeZone={settings.timeZone}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
