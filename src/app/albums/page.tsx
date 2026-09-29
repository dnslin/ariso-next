import { readSidebarCollapsed } from '../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { AlbumsScreen } from './screen';

export default async function AlbumsPage() {
  const owner = await requirePageOwner('/albums');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <AlbumsScreen
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
