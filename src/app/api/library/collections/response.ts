import { LibraryQueryError } from '../../../../server/library/query-schema.ts';
export async function readSmartCollectionBody(
  request: Request,
): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new LibraryQueryError('请求内容必须是有效的 JSON');
  }
}
