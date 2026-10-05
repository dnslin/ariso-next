import { NextRequest } from 'next/server.js';
import { publicShareRefreshResponse } from '../../../../server/sharing/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return publicShareRefreshResponse(request, (await context.params).token);
}
