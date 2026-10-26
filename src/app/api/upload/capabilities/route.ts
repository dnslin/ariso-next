import { publicUploadCapabilitiesResponse } from '../../../../server/upload/capabilities.ts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return publicUploadCapabilitiesResponse(request);
}
