import { readSidebarCollapsed } from '../../../../components/shell/sidebar-preference';
import { StorageEditor } from '../../../../components/storage/storage-editor';
import { resolve } from 'node:path';
import { requirePageOwner } from '../../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../../server/site/settings';
import { getServerRuntime } from '../../../../server/startup/server-start';

export default async function StorageEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const owner = await requirePageOwner(
    `/settings/storage/${encodeURIComponent(id)}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <StorageEditor
      storageId={id}
      storageRoot={resolve(getServerRuntime().config.dataDir, 'storage')}
      initialSaved={(await searchParams).saved === '1'}
      name={settings.name}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
