import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { brandingUrl } from '../../../server/site/urls';
import { getServerRuntime } from '../../../server/startup/server-start';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AlbumsScreen } from '../screen';

export default async function AlbumPage({
  params,
  searchParams,
}: {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { albumId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, item);
  }
  const owner = await requirePageOwner(
    `/albums/${encodeURIComponent(albumId)}${query.size ? `?${query}` : ''}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <NuqsAdapter>
      <AlbumsScreen
        key={albumId}
        albumId={albumId}
        timeZone={settings.timeZone}
        name={settings.name}
        logoUrl={brandingUrl(settings.logoKey)}
        description={settings.description}
        email={owner.email}
        ownerName={owner.name}
        initialSidebarCollapsed={await readSidebarCollapsed()}
      />
    </NuqsAdapter>
  );
}
