import {
  createShare,
  readOwnerShare,
  updateShare,
} from '../../../../../server/sharing/configuration.ts';
import {
  ownerShareResponse,
  shareBody,
} from '../../../../../server/sharing/http.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return ownerShareResponse(request, async () => ({
    share: readOwnerShare(
      getServerRuntime().connection.db,
      (await context.params).id,
    ),
  }));
}
export function POST(request: Request, context: Context) {
  return ownerShareResponse(request, async () => ({
    share: await createShare(
      getServerRuntime().connection.db,
      (await context.params).id,
      await shareBody(request),
    ),
  }));
}
export function PATCH(request: Request, context: Context) {
  return ownerShareResponse(request, async () => ({
    share: await updateShare(
      getServerRuntime().connection.db,
      (await context.params).id,
      await shareBody(request),
    ),
  }));
}
