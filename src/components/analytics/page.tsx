import { readSidebarCollapsed } from '../shell/sidebar-preference';
import { requirePageOwner } from '../../server/identity/owner-page';
import { requireSiteSettings } from '../../server/site/settings';
import { brandingUrl } from '../../server/site/urls';
import { getServerRuntime } from '../../server/startup/server-start';
import { AnalyticsScreen } from './screen';

export async function AnalyticsPage({
  dashboard,
  searchParams,
}: {
  dashboard: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, item);
  const pathname = dashboard ? '/dashboard' : '/analytics';
  const owner = await requirePageOwner(
    `${pathname}${query.size ? `?${query}` : ''}`,
  );
  const settings = requireSiteSettings(getServerRuntime().connection.db);
  return (
    <AnalyticsScreen
      dashboard={dashboard}
      initialSidebarCollapsed={await readSidebarCollapsed()}
      name={settings.name}
      logoUrl={brandingUrl(settings.logoKey)}
      description={settings.description}
      email={owner.email}
      ownerName={owner.name}
      timeZone={settings.timeZone}
    />
  );
}
