import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { StorageList } from '../../../components/storage/storage-list';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { getServerRuntime } from '../../../server/startup/server-start';

export default async function StoragePage() {
  const owner = await requirePageOwner('/settings/storage');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <StorageList
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
