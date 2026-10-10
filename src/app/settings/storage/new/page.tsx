import { resolve } from 'node:path';
import { readSidebarCollapsed } from '../../../../components/shell/sidebar-preference';
import { StorageEditor } from '../../../../components/storage/storage-editor';
import { requirePageOwner } from '../../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../../server/site/settings';
import { brandingUrl } from '../../../../server/site/urls';
import { getServerRuntime } from '../../../../server/startup/server-start';

export default async function StorageCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const owner = await requirePageOwner('/settings/storage/new');
  const runtime = getServerRuntime();
  const settings = requireSiteSettings(runtime.connection.db);
  return (
    <StorageEditor
      name={settings.name}
      logoUrl={brandingUrl(settings.logoKey)}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      storageRoot={resolve(runtime.config.dataDir, 'storage')}
      initialType={(await searchParams).type === 's3' ? 's3' : 'local'}
      initialSidebarCollapsed={await readSidebarCollapsed()}
    />
  );
}
