import { AccessProtectionPage } from '../../../../components/access-protection/page';
import { readSidebarCollapsed } from '../../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../../server/site/settings';
import { brandingUrl } from '../../../../server/site/urls';
import { getServerRuntime } from '../../../../server/startup/server-start';

export default async function Page() {
  const owner = await requirePageOwner('/settings/general/access-protection');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <AccessProtectionPage
      name={settings.name}
      description={settings.description}
      logoUrl={brandingUrl(settings.logoKey)}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
