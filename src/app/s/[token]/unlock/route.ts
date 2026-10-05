import { NextRequest } from 'next/server.js';
import { unlockShareResponse } from '../../../../server/sharing/http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return unlockShareResponse(request, (await context.params).token);
}
