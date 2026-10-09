import { readSiteSettings } from '../../../server/site/settings.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';
import { createUploadOpenApiDocument } from '../../../server/upload/openapi.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const site = readSiteSettings(getServerRuntime().connection.db);
  const headers = { 'Cache-Control': 'no-store' };
  if (!site)
    return Response.json(
      { code: 'SITE_NOT_INITIALIZED', message: '站点尚未初始化' },
      { status: 409, headers },
    );
  return Response.json(createUploadOpenApiDocument(site.publicUrl), {
    headers,
  });
}
