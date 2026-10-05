import { ProcessingPage } from '../../../components/processing/processing-page';
import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { getServerRuntime } from '../../../server/startup/server-start';

export default async function Page() {
  const owner = await requirePageOwner('/settings/processing');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <ProcessingPage
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
