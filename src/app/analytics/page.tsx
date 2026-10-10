import { AnalyticsPage } from '../../components/analytics/page';

export default function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AnalyticsPage dashboard={false} searchParams={searchParams} />;
}
