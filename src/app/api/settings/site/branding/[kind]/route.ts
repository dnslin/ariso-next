import { writeBrandingResponse } from '../../../../../../server/site/branding-http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  return writeBrandingResponse(request, (await context.params).kind);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  return writeBrandingResponse(request, (await context.params).kind);
}
