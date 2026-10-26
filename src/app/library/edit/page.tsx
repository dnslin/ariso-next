import { readSidebarCollapsed } from '../../../components/shell/sidebar-preference';
import { requirePageOwner } from '../../../server/identity/owner-page';
import { requireSiteSettings } from '../../../server/site/settings';
import { brandingUrl } from '../../../server/site/urls';
import { getServerRuntime } from '../../../server/startup/server-start';
import { ImageEditorScreen } from '../../../components/image-editor/screen';
import { imageEditorReturn } from '../../../components/image-editor/return-to';

export default async function ImageEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const imageIds = Array.isArray(params.image)
    ? params.image
    : params.image
      ? [params.image]
      : [];
  const requestId =
    typeof params.requestId === 'string' ? params.requestId : undefined;
  const query = new URLSearchParams();
  imageIds.forEach((id) => query.append('image', id));
  if (requestId) query.set('requestId', requestId);
  const owner = await requirePageOwner(
    `/library/edit${query.size ? `?${query}` : ''}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <ImageEditorScreen
      name={settings.name}
      logoUrl={brandingUrl(settings.logoKey)}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      initialSidebarCollapsed={await readSidebarCollapsed()}
      imageIds={imageIds}
      requestId={requestId}
      returnTo={imageEditorReturn(
        typeof params.returnTo === 'string' ? params.returnTo : null,
      )}
    />
  );
}
