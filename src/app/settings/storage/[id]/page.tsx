import { readSidebarCollapsed } from '../../../../components/shell/sidebar-preference';
import { CorsScreen } from '../../../../components/storage/cors-screen';
import { requirePageOwner } from '../../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../../server/site/settings';
import { getServerRuntime } from '../../../../server/startup/server-start';

export default async function StorageCorsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await requirePageOwner(
    `/settings/storage/${encodeURIComponent(id)}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <CorsScreen
      storageId={id}
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
