import {
  createImageShare,
  readOwnerImageShare,
  revokeOwnerImageShare,
} from '../../../../../server/sharing/image-configuration.ts';
import {
  ownerShareResponse,
  shareBody,
} from '../../../../../server/sharing/http.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return ownerShareResponse(request, async () =>
    readOwnerImageShare(
      getServerRuntime().connection.db,
      (await context.params).id,
    ),
  );
}
export function POST(request: Request, context: Context) {
  return ownerShareResponse(
    request,
    async () => ({
      share: createImageShare(
        getServerRuntime().connection.db,
        (await context.params).id,
        await shareBody(request),
      ),
    }),
    'image-share:POST',
  );
}
export function DELETE(request: Request, context: Context) {
  return ownerShareResponse(
    request,
    async () =>
      revokeOwnerImageShare(
        getServerRuntime().connection.db,
        (await context.params).id,
      ),
    'image-share:DELETE',
  );
}
