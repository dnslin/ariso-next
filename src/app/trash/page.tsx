import { readSidebarCollapsed } from '../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { TrashScreen } from './trash-screen';

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const image = typeof params.image === 'string' ? params.image : null;
  const returnTo = image
    ? `/trash?${new URLSearchParams({ image })}`
    : '/trash';
  const owner = await requirePageOwner(returnTo);
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <TrashScreen
      initialSidebarCollapsed={await readSidebarCollapsed()}
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
    />
  );
}
