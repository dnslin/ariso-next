import { AnalyticsPage } from '../../components/analytics/page';

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AnalyticsPage dashboard searchParams={searchParams} />;
}
