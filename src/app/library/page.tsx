import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { LibraryScreen } from './library-screen';

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const image = typeof params.image === 'string' ? params.image : null;
  const returnTo = image
    ? `/library?${new URLSearchParams({ image })}`
    : '/library';
  const owner = await requirePageOwner(returnTo);
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <LibraryScreen
      name={settings.name}
      description={settings.description}
      email={owner.email}
    />
  );
}
