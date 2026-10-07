import {
  analyticsResponse,
  parseOverviewDays,
} from '../../../../server/analytics/http.ts';
import { readOverview } from '../../../../server/analytics/usage.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return analyticsResponse(request, () => {
    parseOverviewDays(request);
    return readOverview(getServerRuntime().connection.db);
  });
}
