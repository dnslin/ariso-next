import { readSidebarCollapsed } from '../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { brandingUrl } from '../../server/site/urls';
import { getServerRuntime } from '../../server/startup/server-start';
import { UploadScreen } from '../../components/upload/screen';
import { readUploadContext } from '../../components/upload/context';

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = readUploadContext(await searchParams);
  const returnTo = context.albumId
    ? `/upload?${new URLSearchParams({ albumId: context.albumId, returnTo: context.returnTo! })}`
    : '/upload';
  const owner = await requirePageOwner(returnTo);
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <UploadScreen
      key={context.albumId ?? 'page'}
      {...context}
      initialSidebarCollapsed={await readSidebarCollapsed()}
      name={settings.name}
      logoUrl={brandingUrl(settings.logoKey)}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
    />
  );
}
