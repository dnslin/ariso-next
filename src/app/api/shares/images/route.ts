import { parseShareQuery } from '../../../../server/sharing/configuration.ts';
import { listImageShares } from '../../../../server/sharing/image-configuration.ts';
import { ownerShareResponse } from '../../../../server/sharing/http.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return ownerShareResponse(request, () =>
    listImageShares(
      getServerRuntime().connection.db,
      parseShareQuery(new URL(request.url).searchParams),
    ),
  );
}
