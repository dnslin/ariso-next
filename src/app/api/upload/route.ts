import { publicUploadResponse } from '../../../server/upload/public-http.ts';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return publicUploadResponse(request);
}
