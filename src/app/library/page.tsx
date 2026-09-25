import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOwner } from '../../server/identity/owner';
import { requireSiteSettings } from '../../server/site/settings';
import { getServerRuntime } from '../../server/startup/server-start';
import { LibraryScreen } from './library-screen';

export default async function LibraryPage() {
  const requestHeaders = await headers();
  let owner;
  try {
    owner = await requireOwner(
      new Request('http://ariso.internal/library', { headers: requestHeaders }),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'UNAUTHORIZED'
    )
      throw error;
    const hadCookie = /(?:^|;\s*)(?:__Secure-)?ariso\.session_token=/.test(
      requestHeaders.get('cookie') ?? '',
    );
    redirect(`/login?returnTo=%2Flibrary${hadCookie ? '&reason=expired' : ''}`);
  }
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <LibraryScreen
      name={settings.name}
      description={settings.description}
      email={owner.email}
    />
  );
}
