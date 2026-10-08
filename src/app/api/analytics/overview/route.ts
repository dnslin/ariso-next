import {
  analyticsResponse,
  parseOverviewDays,
} from '../../../../server/analytics/http.ts';
import { readOverview } from '../../../../server/analytics/queries.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return analyticsResponse(request, () => {
    const server = getServerRuntime();
    return readOverview(server.connection.db, {
      days: parseOverviewDays(request),
      health: server.analytics.health,
    });
  });
}
