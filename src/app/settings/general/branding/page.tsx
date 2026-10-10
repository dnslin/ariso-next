import { BrandingPage } from '../../../../components/site/branding-page';
import { readSidebarCollapsed } from '../../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../../server/site/settings';
import { brandingUrl } from '../../../../server/site/urls';
import { getServerRuntime } from '../../../../server/startup/server-start';

export default async function Page() {
  const owner = await requirePageOwner('/settings/general/branding');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <BrandingPage
      name={settings.name}
      description={settings.description}
      logoUrl={brandingUrl(settings.logoKey)}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
