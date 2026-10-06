import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { getServerRuntime } from '../../../server/startup/server-start';
import { SettingsScreen } from '../settings';

export default async function ShareSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { albumId } = await params;
  const fromAlbum = (await searchParams).from === 'album';
  const owner = await requirePageOwner(
    `/shares/${encodeURIComponent(albumId)}${fromAlbum ? '?from=album' : ''}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <SettingsScreen
      key={albumId}
      albumId={albumId}
      fromAlbum={fromAlbum}
      timeZone={settings.timeZone}
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
