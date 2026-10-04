import { readLibraryCopy } from '../../../../server/library/copy.ts';
import { LibraryQueryError } from '../../../../server/library/query-schema.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { respondToLibraryQuery } from '../query-response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return respondToLibraryQuery(request, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new LibraryQueryError('批量复制请求必须为有效 JSON');
      throw error;
    }
    return readLibraryCopy(getServerRuntime().connection.db, body);
  });
}
