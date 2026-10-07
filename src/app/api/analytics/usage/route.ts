import { analyticsResponse } from '../../../../server/analytics/http.ts';
import { readUsage } from '../../../../server/analytics/usage.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return analyticsResponse(request, () =>
    readUsage(getServerRuntime().connection.db),
  );
}
