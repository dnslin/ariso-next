import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { brandingUrl } from '../../../server/site/urls';
import { getServerRuntime } from '../../../server/startup/server-start';
import { SettingsScreen } from '../settings';
import {
  readCollectionReturn,
  shareSettingsHref,
} from '../../albums/collection-navigation';

export default async function ShareSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { albumId } = await params;
  const returnHref = readCollectionReturn(
    (await searchParams).returnTo,
    albumId,
    '/shares',
  );
  const owner = await requirePageOwner(shareSettingsHref(albumId, returnHref));
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <SettingsScreen
      key={albumId}
      albumId={albumId}
      returnHref={returnHref}
      timeZone={settings.timeZone}
      name={settings.name}
      logoUrl={brandingUrl(settings.logoKey)}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
