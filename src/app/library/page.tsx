import { readSidebarCollapsed } from '../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { LibraryScreen } from './library-screen';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, item);
  }
  const returnTo = `/library${query.size ? `?${query}` : ''}`;
  const owner = await requirePageOwner(returnTo);
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <NuqsAdapter>
      <LibraryScreen
        initialSidebarCollapsed={await readSidebarCollapsed()}
        name={settings.name}
        description={settings.description}
        email={owner.email}
        ownerName={owner.name}
        timeZone={settings.timeZone}
      />
    </NuqsAdapter>
  );
}
