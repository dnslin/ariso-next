import { readBrandingResponse } from '../../../server/site/branding-http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  return readBrandingResponse(request, (await context.params).key);
}
