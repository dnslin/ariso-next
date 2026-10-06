import { NextRequest } from 'next/server.js';
import { publicShareItemsResponse } from '../../../../server/sharing/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return publicShareItemsResponse(request, (await context.params).token);
}
