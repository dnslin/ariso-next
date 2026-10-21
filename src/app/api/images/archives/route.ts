import { respondToArchive } from '../../../../server/delivery/archive-http.ts';
import { parseArchiveRequest } from '../../../../server/delivery/archive-selection.ts';
import { LibraryQueryError } from '../../../../server/library/query-schema.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return respondToArchive(request, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new LibraryQueryError(
          '下载清单必须为有效 JSON',
          'ARCHIVE_INVALID_REQUEST',
        );
      throw error;
    }
    const input = parseArchiveRequest(body);
    return getServerRuntime().archive.prepare(input, request.signal);
  });
}
