import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { LibraryScreen } from './library-screen';

export default async function LibraryPage() {
  const owner = await requirePageOwner('/library');
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <LibraryScreen
      name={settings.name}
      description={settings.description}
      email={owner.email}
    />
  );
}
