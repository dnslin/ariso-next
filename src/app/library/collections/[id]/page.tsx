import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { notFound } from 'next/navigation';
import { readSidebarCollapsed } from '../../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../../server/site/settings';
import { brandingUrl } from '../../../../server/site/urls';
import { getServerRuntime } from '../../../../server/startup/server-start';
import { readSmartCollection } from '../../../../server/library/smart-collections';
import { resolveSmartRules } from '../../../../server/library/smart-rules';
import { LibraryQueryError } from '../../../../server/library/query-schema';
import { LibraryScreen } from '../../library-screen';

export default async function SmartCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await requirePageOwner(
    `/library/collections/${encodeURIComponent(id)}`,
  );
  const db = getServerRuntime().connection.db;
  const settings = requireSiteSettings(db);
  let collection;
  try {
    collection = readSmartCollection(db, id);
  } catch (error) {
    if (error instanceof LibraryQueryError && error.status === 404) notFound();
    throw error;
  }
  return (
    <NuqsAdapter>
      <LibraryScreen
        key={id}
        initialSidebarCollapsed={await readSidebarCollapsed()}
        name={settings.name}
        logoUrl={brandingUrl(settings.logoKey)}
        description={settings.description}
        email={owner.email}
        ownerName={owner.name}
        timeZone={settings.timeZone}
        collection={collection}
        initialQuery={resolveSmartRules(collection.rules)}
      />
    </NuqsAdapter>
  );
}
