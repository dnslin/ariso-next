import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { getServerRuntime } from '../../../server/startup/server-start';
import { AlbumsScreen } from '../screen';

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ albumId: string }>;
}) {
  const { albumId } = await params;
  const owner = await requirePageOwner(
    `/albums/${encodeURIComponent(albumId)}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <AlbumsScreen
      key={albumId}
      albumId={albumId}
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
