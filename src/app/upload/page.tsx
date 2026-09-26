import { readSidebarCollapsed } from '../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { UploadScreen } from '../../components/upload/screen';

export default async function UploadPage() {
  const owner = await requirePageOwner('/upload');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <UploadScreen
      initialSidebarCollapsed={await readSidebarCollapsed()}
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
    />
  );
}
